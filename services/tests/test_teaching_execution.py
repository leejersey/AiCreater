import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

from services.visual import teaching_execution as execution


class OwnedExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.parent = Path(self.temp.name).resolve()
        self.output = self.parent / str(uuid.uuid4())

    def run_child(self, source, **kwargs):
        return execution.run_owned([sys.executable, '-c', source], input='hello',
            env={'PATH': os.environ['PATH'], 'MODEL_API_KEY': 'secret', 'DATABASE_URL': 'secret'},
            cwd=self.parent, timeout=kwargs.pop('timeout', 5), output=self.output, **kwargs)

    def test_child_bound_before_start_and_secrets_not_forwarded(self):
        result = self.run_child('import os,json,sys,pathlib; '
            'p=pathlib.Path(sys.argv[0]) if False else pathlib.Path.cwd(); '
            'r=json.loads(next(p.glob("*.owner.json")).read_text()); '
            'assert r["hostPgid"]==os.getpgrp(); '
            'assert r["hostNonce"]==os.environ["TEACHING_HOST_NONCE"]; '
            'assert os.environ["TEACHING_HOST_PGID"]==str(os.getpgrp()); '
            'assert "MODEL_API_KEY" not in os.environ and "DATABASE_URL" not in os.environ; '
            'print(sys.stdin.read())', text=True, capture_output=True)
        self.assertIsInstance(result, subprocess.CompletedProcess)
        self.assertEqual(result.stdout, 'hello\n')
        self.assertFalse(self.output.exists())
        record = (self.parent / (self.output.name + '.owner.json')).read_text()
        self.assertNotIn('secret', record)
        self.assertNotIn('import os', record)

    def test_timeout_terminates_only_own_live_group(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            self.run_child('import time; time.sleep(30)', timeout=.1)
        record = json.loads((self.parent / (self.output.name + '.owner.json')).read_text())
        with self.assertRaises(ProcessLookupError):
            os.killpg(record['hostPgid'], 0)

    def test_bounded_stdout(self):
        with self.assertRaises(ValueError):
            self.run_child('import sys; sys.stdout.write("x"*(2*1024*1024))')

    def test_replaced_owner_reservation_never_overwrites_another_empty_file(self):
        real=execution.subprocess.Popen
        def replace(*args,**kwargs):
            child=real(*args,**kwargs)
            other=self.parent/'unrelated-empty';other.touch()
            os.replace(other,self.parent/(self.output.name+'.owner.json'))
            return child
        with patch.object(execution.subprocess,'Popen',side_effect=replace):
            with self.assertRaises(ValueError):self.run_child('print("must not execute")')
        self.assertEqual((self.parent/(self.output.name+'.owner.json')).read_bytes(),b'')

    def test_reject_existing_output_and_symlink_parent(self):
        self.output.mkdir()
        with self.assertRaises((ValueError, FileExistsError)):
            self.run_child('pass')
        self.output.rmdir()
        link = self.parent / 'link'
        link.symlink_to(self.parent, target_is_directory=True)
        self.output = link / self.output.name
        with self.assertRaises((ValueError, OSError)):
            self.run_child('pass')

    def fixture(self):
        self.output.mkdir()
        self.owner = {'schemaVersion': 'teaching-host-owner:1', 'jobId': self.output.name,
            'hostNonce': 'b'*64, 'hostPgid': 123456789}
        self.identity = {'schemaVersion': 'teaching-container-execution:1', 'jobId': self.output.name,
            'hostNonce': 'b'*64, 'hostPgid': 123456789, 'executionNonce': 'c'*64,
            'containerName': 'aicreater-teaching-'+self.output.name,
            'image': 'aicreater-teaching-renderer:local'}
        self.container = {'Id': 'a'*64, 'Name': '/'+self.identity['containerName'],
            'Config': {'Image': self.identity['image'], 'Labels': {
                'aicreater.teaching-job': self.output.name,
                'aicreater.teaching-execution-nonce': 'c'*64}}}
        self.save_fixture()

    def save_fixture(self):
        (self.parent / (self.output.name+'.owner.json')).write_text(json.dumps(self.owner))
        (self.output / 'execution.json').write_text(json.dumps(self.identity))

    def docker(self, args):
        self.calls.append(args)
        if args[0] == 'inspect':
            return json.dumps([self.container])
        return ''

    def reconcile(self, absent=True):
        self.calls = []
        with patch.object(execution, '_docker', side_effect=self.docker), patch.object(
                execution.os, 'killpg', side_effect=ProcessLookupError if absent else None):
            return execution.reconcile_orphan(self.output)

    def test_orphan_removed_by_full_id_only_and_proof_binds_nonce(self):
        self.fixture()
        self.assertTrue(self.reconcile())
        self.assertIn(['rm', '-f', 'a'*64], self.calls)
        proof = json.loads((self.output/'cleanup.json').read_text())
        self.assertEqual(proof, {'schemaVersion': 'teaching-container-cleanup:1',
            'jobId': self.output.name, 'containerId': 'a'*64,
            'containerName': self.identity['containerName'], 'executionNonce': 'c'*64, 'status': 'absent'})

    def test_live_or_reused_group_is_fenced_without_docker(self):
        self.fixture()
        self.assertFalse(self.reconcile(absent=False))
        self.assertEqual(self.calls, [])

    def test_binding_mismatch_is_fenced(self):
        for field, value in [('hostNonce', 'd'*64), ('hostPgid', 1), ('jobId', str(uuid.uuid4())),
                ('executionNonce', 'bad'), ('containerName', 'other'), ('image', 'other')]:
            with self.subTest(field=field):
                if not self.output.exists(): self.fixture()
                old = self.identity[field]
                self.identity[field] = value
                self.save_fixture()
                self.assertFalse(self.reconcile())
                self.assertFalse(any(c[0]=='rm' for c in self.calls))
                self.identity[field] = old

    def test_container_mismatch_is_never_removed(self):
        self.fixture()
        for field in ['Id', 'Name', 'image', 'job', 'nonce']:
            with self.subTest(field=field):
                container = json.loads(json.dumps(self.container))
                if field in ('Id', 'Name'): self.container[field] = 'other'
                elif field=='image': self.container['Config']['Image'] = 'other'
                else: self.container['Config']['Labels']['aicreater.teaching-'+('job' if field=='job' else 'execution-nonce')] = 'other'
                self.assertFalse(self.reconcile())
                self.assertFalse(any(c[0]=='rm' for c in self.calls))
                self.container = container

    def test_absent_initial_container_and_daemon_failure_stay_fenced(self):
        self.fixture()
        for response in ['[]', OSError('daemon unavailable')]:
            with patch.object(execution, '_docker', side_effect=response if isinstance(response, Exception) else None,
                    return_value=response), patch.object(execution.os, 'killpg', side_effect=ProcessLookupError):
                self.assertFalse(execution.reconcile_orphan(self.output))
        self.assertFalse((self.output/'cleanup.json').exists())

    def test_remaining_id_or_name_blocks_proof(self):
        self.fixture()
        for output in ['a'*64, self.identity['containerName']]:
            def docker(args):
                return json.dumps([self.container]) if args[0]=='inspect' else output if args[0]=='ps' else ''
            with patch.object(execution, '_docker', side_effect=docker), patch.object(execution.os, 'killpg', side_effect=ProcessLookupError):
                self.assertFalse(execution.reconcile_orphan(self.output))
            self.assertFalse((self.output/'cleanup.json').exists())

    def test_unsafe_or_missing_records_cannot_authorize_docker(self):
        self.fixture()
        file = self.output/'execution.json'
        for mode in ['missing', 'symlink', 'large', 'fifo']:
            with self.subTest(mode=mode):
                file.unlink(missing_ok=True)
                if mode=='symlink': file.symlink_to(self.parent/(self.output.name+'.owner.json'))
                elif mode=='large': file.write_text(' '*5000)
                elif mode=='fifo': os.mkfifo(file)
                self.assertFalse(self.reconcile())
                self.assertEqual(self.calls, [])

    @unittest.skipUnless(os.environ.get('RUN_TEACHING_ISOLATED_TEST')=='1','Explicit owned-container cleanup smoke opt-in')
    def test_real_owned_orphan_is_removed_only_after_its_host_group_exits(self):
        # Fixed test driver, not model source: exits deliberately with its own bounded container alive.
        source="""
import json,os,pathlib,subprocess,sys
p=pathlib.Path(sys.argv[1]);owner=json.loads((p.parent/(p.name+'.owner.json')).read_text());p.mkdir()
identity={'schemaVersion':'teaching-container-execution:1','jobId':p.name,'containerName':'aicreater-teaching-'+p.name,
 'image':'aicreater-teaching-renderer:local','hostNonce':owner['hostNonce'],'hostPgid':owner['hostPgid'],'executionNonce':owner['hostNonce']}
(p/'execution.json').write_text(json.dumps(identity))
args=['docker','create','--pull=never','--name',identity['containerName'],'--label','aicreater.teaching-job='+p.name,
 '--label','aicreater.teaching-execution-nonce='+identity['executionNonce'],'--network','none','--cap-drop','ALL',
 '--security-opt','no-new-privileges','--pids-limit','32','--memory','128m','--cpus','0.25','--entrypoint','node',identity['image'],'-e','setInterval(()=>{},1000)']
created=subprocess.run(args,text=True,capture_output=True,check=True,timeout=30).stdout.strip()
subprocess.run(['docker','start',created],capture_output=True,check=True,timeout=30)
print(created,flush=True);sys.exit(17)
"""
        try:
            result=execution.run_owned([sys.executable,'-c',source,str(self.output)],input='',
                env={key:os.environ[key] for key in ('PATH','HOME') if key in os.environ},cwd=self.parent,timeout=90,output=self.output)
            self.assertEqual(result.returncode,17);self.assertFalse(execution.cleanup_verified(self.output))
            self.assertTrue(execution.reconcile_orphan(self.output));self.assertTrue(execution.cleanup_verified(self.output))
        finally:
            if (self.output/'execution.json').is_file():
                identity=json.loads((self.output/'execution.json').read_text())
                try:container=execution._container(identity,identity['containerName'])
                except (OSError,ValueError):pass
                else:execution._docker(['rm','-f',container])


if __name__ == '__main__':
    unittest.main()
