import io
import json
import os
import select
import socket
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]


class WorkbenchCliTests(unittest.TestCase):
    def test_help_has_only_status_and_run_without_starting_services(self):
        result = subprocess.run([sys.executable, '-m', 'services.workbench', '--help'], cwd=ROOT, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('{status,run}', result.stdout)

    def test_worker_command_is_not_available(self):
        result = subprocess.run([sys.executable, '-m', 'services.workbench', 'worker'], cwd=ROOT, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertIn('invalid choice', result.stderr)


class WorkbenchDiskTests(unittest.TestCase):
    def setUp(self):
        from services import workbench
        self.w = workbench

    def test_available_space_boundaries_use_twenty_gib(self):
        self.assertTrue(callable(getattr(self.w, 'disk_status', None)), 'missing disk_status')
        threshold = 20 * 1024 ** 3
        for free, state in [(0, 'low'), (threshold - 1, 'low'), (threshold, 'ok'), (threshold + 1, 'ok')]:
            with self.subTest(free=free), patch.object(self.w.shutil, 'disk_usage', return_value=MagicMock(free=free)) as usage:
                self.assertEqual(self.w.disk_status(), {'state': state, 'available_bytes': free, 'threshold_bytes': threshold})
                usage.assert_called_once_with(self.w.ROOT)

    def test_disk_read_failure_is_unavailable_without_exception_text(self):
        self.assertTrue(callable(getattr(self.w, 'disk_status', None)), 'missing disk_status')
        with patch.object(self.w.shutil, 'disk_usage', side_effect=OSError('private-path-secret')):
            self.assertEqual(self.w.disk_status(), {'state': 'unavailable', 'available_bytes': None, 'threshold_bytes': 20 * 1024 ** 3})

    def test_status_adds_disk_without_starting_or_signaling(self):
        threshold = 20 * 1024 ** 3
        tasks = [{'kind': 'render', 'state': 'queued', 'count': 1}]
        for error, free, state in [(None, threshold - 1, 'low'), (OSError('private-path-secret'), None, 'unavailable')]:
            with self.subTest(state=state), patch.object(self.w.platform, 'system', return_value='Darwin'), patch.object(self.w.shutil, 'which', return_value='/tool'), patch.object(self.w, 'trusted_config', return_value={}), patch.object(self.w, 'basic_ready', return_value=tasks), patch.object(self.w, 'inspect_role', return_value={'state': 'ready', 'groups': [123]}), patch.object(self.w.shutil, 'disk_usage', return_value=MagicMock(free=free), side_effect=error), patch.object(self.w.subprocess, 'Popen') as spawn, patch.object(self.w.os, 'killpg') as kill, patch('sys.stdout', new_callable=io.StringIO) as output:
                self.assertEqual(self.w.main(['status']), 0)
                self.assertEqual(json.loads(output.getvalue()), {'code': 'status', 'services': {role: {'state': 'ready', 'controlled': False} for role in self.w.COMMANDS}, 'tasks': tasks, 'disk': {'state': state, 'available_bytes': free, 'threshold_bytes': threshold}})
                spawn.assert_not_called(); kill.assert_not_called()

    def test_run_does_not_query_disk(self):
        with patch.object(self.w.platform, 'system', return_value='Darwin'), patch.object(self.w.shutil, 'which', return_value='/tool'), patch.object(self.w, 'trusted_config', return_value={}), patch.object(self.w, 'basic_ready', return_value=[]), patch.object(self.w, 'Supervisor') as supervisor, patch.object(self.w.shutil, 'disk_usage') as usage:
            supervisor.return_value.run.return_value = 0
            self.assertEqual(self.w.main(['run']), 0)
            usage.assert_not_called()

    def test_foundation_failure_keeps_error_code_and_skips_disk(self):
        with patch.object(self.w.platform, 'system', return_value='Darwin'), patch.object(self.w.shutil, 'which', return_value='/tool'), patch.object(self.w, 'trusted_config', return_value={}), patch.object(self.w, 'basic_ready', side_effect=self.w.SafetyError('database_unavailable')), patch.object(self.w.shutil, 'disk_usage') as usage, patch('sys.stdout', new_callable=io.StringIO) as output:
            self.assertEqual(self.w.main(['status']), 1)
            self.assertEqual(json.loads(output.getvalue()), {'code': 'database_unavailable'})
            usage.assert_not_called()


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        from services import workbench
        self.w = workbench

    def test_trusted_configuration_rejects_public_or_symlink_files(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(self.w, 'ROOT', Path(folder)):
            for name in ['.env', '.env.local-services']:
                p=Path(folder)/name; p.write_text('DATABASE_URL=postgresql://u:private@127.0.0.1:15432/db\n'); p.chmod(0o600)
            self.assertIn('DATABASE_URL', self.w.trusted_config())
            p=Path(folder)/'.env'; p.chmod(0o644)
            with self.assertRaises(self.w.SafetyError): self.w.trusted_config()
            p.unlink(); p.symlink_to(Path(folder)/'.env.local-services')
            with self.assertRaises(self.w.SafetyError): self.w.trusted_config()

    def test_activity_uses_readonly_bounded_local_connection(self):
        conn=MagicMock(); conn.__enter__.return_value=conn
        conn.execute.return_value.fetchall.return_value=[('render','queued',2)]
        with patch.object(self.w.psycopg,'connect',return_value=conn) as connect:
            self.assertEqual(self.w.activity({'DATABASE_URL':'postgresql://u:private@127.0.0.1:15432/db'}),[{'kind':'render','state':'queued','count':2}])
        self.assertIn('default_transaction_read_only=on',connect.call_args.kwargs['options'])
        self.assertIn('statement_timeout',connect.call_args.kwargs['options'])
        self.assertLessEqual(connect.call_args.kwargs['connect_timeout'],5)

    def test_remote_database_is_rejected_without_connecting(self):
        with patch.object(self.w.psycopg,'connect') as connect:
            with self.assertRaises(self.w.SafetyError): self.w.activity({'DATABASE_URL':'postgresql://u:private@remote.example:5432/db'})
            connect.assert_not_called()

    def test_same_project_identity_requires_command_and_cwd(self):
        responses=[subprocess.CompletedProcess([],0,'n'+str(ROOT)+'\n'),subprocess.CompletedProcess([],0,'Mon Oct 13 20:00:00 2026\n'),subprocess.CompletedProcess([],0,'python3 -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000\n')]
        with patch.object(self.w.subprocess,'run',side_effect=responses): self.assertTrue(self.w.process_identity(123,'api'))
        responses[0]=subprocess.CompletedProcess([],0,'n/private/tmp/another-project\n')
        with patch.object(self.w.subprocess,'run',side_effect=responses):
            with self.assertRaises(self.w.SafetyError): self.w.process_identity(123,'api')

    def test_unknown_command_is_not_accepted_for_same_cwd(self):
        responses=[subprocess.CompletedProcess([],0,'n'+str(ROOT)+'\n'),subprocess.CompletedProcess([],0,'Mon Oct 13 20:00:00 2026\n'),subprocess.CompletedProcess([],0,'python3 another_server.py private-token\n')]
        with patch.object(self.w.subprocess,'run',side_effect=responses):
            with self.assertRaises(self.w.SafetyError) as error: self.w.process_identity(123,'api')
        self.assertNotIn('private-token',str(error.exception))

    def test_argv_substring_does_not_spoof_api_identity(self):
        responses=[subprocess.CompletedProcess([],0,'n'+str(ROOT)+'\n'),subprocess.CompletedProcess([],0,'Mon Oct 13 20:00:00 2026\n'),subprocess.CompletedProcess([],0,'python3 unrelated.py -m uvicorn services.api.app:app\n')]
        with patch.object(self.w.subprocess,'run',side_effect=responses):
            with self.assertRaises(self.w.SafetyError): self.w.process_identity(123,'api')

    def test_absent_service_does_not_probe_http_or_processes(self):
        with patch.object(self.w,'listeners',return_value={}),patch.object(self.w,'healthy') as health:
            self.assertEqual(self.w.inspect_role('api'),{'state':'absent','groups':[]}); health.assert_not_called()

    def test_non_loopback_listener_is_rejected(self):
        with patch.object(self.w,'listeners',return_value={123:['*:8000']}),patch.object(self.w,'healthy') as health:
            with self.assertRaises(self.w.SafetyError): self.w.inspect_role('api')
            health.assert_not_called()

    def test_identity_change_during_health_check_is_rejected(self):
        with patch.object(self.w,'listeners',return_value={123:['127.0.0.1:8000']}),patch.object(self.w,'process_identity',side_effect=[(123,'old'),(123,'new')]),patch.object(self.w,'healthy',return_value=True):
            with self.assertRaises(self.w.SafetyError): self.w.inspect_role('api')

    def test_existing_services_are_reused_without_popen(self):
        s=self.w.Supervisor({})
        with patch.object(self.w,'inspect_role',return_value={'state':'ready','groups':[123]}),patch.object(self.w.subprocess,'Popen') as launch:
            s.start(); self.assertEqual(s.processes,{}); launch.assert_not_called()

    def test_spawn_uses_fixed_app_commands_and_own_session(self):
        s=self.w.Supervisor({'PRIVATE':'hidden'})
        with patch.object(self.w,'inspect_role',return_value={'state':'absent','groups':[]}),patch.object(self.w.subprocess,'Popen') as launch,patch.object(s,'await_ready'):
            s.start()
        self.assertEqual(launch.call_count,2)
        for call in launch.call_args_list:
            self.assertTrue(call.kwargs['start_new_session']); self.assertEqual(call.kwargs['cwd'],ROOT)
            self.assertFalse(any('celery' in arg or arg=='docker' for arg in call.args[0]))
        self.assertIn('--no-proxy-headers',launch.call_args_list[0].args[0])
        self.assertEqual(launch.call_args_list[1].args[0],['npm','run','web'])

    def test_port_race_must_belong_to_the_new_group(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234); child.poll.return_value=None;s.processes['api']=child
        with patch.object(self.w,'inspect_role',return_value={'state':'ready','groups':[999]}):
            with self.assertRaises(self.w.SafetyError): s.await_ready('api')

    def test_busy_jobs_block_all_signals(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234); child.poll.return_value=None;s.processes['api']=child
        with patch.object(self.w,'activity',return_value=[{'kind':'voice','state':'queued','count':1}]),patch.object(self.w.os,'killpg') as kill:
            self.assertFalse(s.stop());kill.assert_not_called()

    def test_database_failure_blocks_all_signals(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234);child.poll.return_value=None;s.processes['api']=child
        with patch.object(self.w,'activity',side_effect=self.w.SafetyError('database_unavailable')),patch.object(self.w.os,'killpg') as kill:
            self.assertFalse(s.stop());kill.assert_not_called()

    def test_idle_stop_only_signals_owned_live_groups(self):
        s=self.w.Supervisor({}); live=MagicMock(pid=234);live.poll.return_value=None;dead=MagicMock(pid=987);dead.poll.return_value=1;s.processes={'api':live,'web':dead}
        with patch.object(self.w,'activity',return_value=[]),patch.object(self.w.os,'killpg') as kill:
            self.assertTrue(s.stop());kill.assert_called_once_with(234,signal.SIGTERM);live.wait.assert_called_once()

    def test_timeout_does_not_escalate_to_kill(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234);child.poll.return_value=None;child.wait.side_effect=subprocess.TimeoutExpired('child',5);s.processes['api']=child
        with patch.object(self.w,'activity',return_value=[]),patch.object(self.w.os,'killpg') as kill:
            self.assertFalse(s.stop());kill.assert_called_once_with(234,signal.SIGTERM)

    def test_signal_failure_keeps_controller_blocked_without_leaking_error(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234);child.poll.return_value=None;s.processes['api']=child
        with patch.object(self.w,'activity',return_value=[]),patch.object(self.w.os,'killpg',side_effect=PermissionError('private-token')):
            self.assertFalse(s.stop())

    def test_start_failure_reclaims_only_owned_processes(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234);child.poll.return_value=None
        def start(): s.processes['api']=child;raise self.w.SafetyError('unknown_listener')
        with patch.object(s,'start',side_effect=start),patch.object(self.w,'activity',return_value=[]),patch.object(self.w,'group_active',return_value=False),patch.object(self.w.os,'killpg') as kill:
            self.assertEqual(s.run(),1);kill.assert_called_once_with(234,signal.SIGTERM)

    def test_lingering_group_blocks_success_after_parent_exits(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234);child.poll.return_value=None;s.processes['api']=child
        with patch.object(self.w,'activity',return_value=[]),patch.object(self.w.os,'killpg') as kill,patch.object(self.w,'group_active',create=True,return_value=True),patch.object(self.w.time,'monotonic',side_effect=[0,6]):
            self.assertFalse(s.stop())
            child.poll.return_value=-15
            self.assertFalse(s.stop())
            kill.assert_called_once_with(234,signal.SIGTERM)

    def test_signal_handler_only_sets_request_without_io(self):
        s=self.w.Supervisor({})
        with patch.object(self.w,'activity') as activity,patch.object(self.w.os,'killpg') as kill:
            s.request_stop(signal.SIGINT,None); self.assertTrue(s.requested);activity.assert_not_called();kill.assert_not_called()

    def test_delayed_requested_shutdown_is_not_reported_as_crash(self):
        s=self.w.Supervisor({}); child=MagicMock(pid=234);child.poll.side_effect=[None,-15];s.processes['api']=child;s.requested=True
        calls=[]
        def stop():
            calls.append(1);s.stopping=True;return len(calls)>1
        with patch.object(s,'start'),patch.object(s,'stop',side_effect=stop),patch.object(self.w.time,'sleep',side_effect=lambda _:s.request_stop(signal.SIGINT,None)):
            self.assertEqual(s.run(),0)

    def test_real_dummy_http_start_and_ctrl_c_stop(self):
        if sys.platform!='darwin': self.skipTest('macOS integration')
        ports=[]
        for _ in range(2):
            with socket.socket() as sock: sock.bind(('127.0.0.1',0));ports.append(sock.getsockname()[1])
        self.assertEqual(len(set(ports)),2)
        actor='from http.server import HTTPServer,BaseHTTPRequestHandler\\nimport sys\\nclass H(BaseHTTPRequestHandler):\\n def do_GET(self):\\n  self.send_response(200);self.end_headers();self.wfile.write(b\'{"status":"ready"}\')\\n def log_message(self,*args):pass\\nHTTPServer(("127.0.0.1",int(sys.argv[1])),H).serve_forever()'
        actor=actor.replace('\\n','\n')
        script='\n'.join(['import os,sys', 'from services import workbench as w',
            f'w.PORTS={{"api":{ports[0]},"web":{ports[1]}}}',
            f'w.COMMANDS={{role:[sys.executable,"-c",{actor!r},str(port)] for role,port in w.PORTS.items()}}',
            'w.activity=lambda env:[]',
            'w.process_identity=lambda pid,role:(pid,w.checked_command(["ps","-p",str(pid),"-o","lstart="]))',
            'sys.exit(w.Supervisor(dict(os.environ)).run())'])
        with tempfile.TemporaryDirectory() as folder:
            env={'PATH':os.environ['PATH'],'HOME':folder,'LC_ALL':'C'}
            process=subprocess.Popen([sys.executable,'-c',script],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                output='';deadline=time.monotonic()+15
                while time.monotonic()<deadline:
                    if select.select([process.stdout],[],[],.2)[0]:
                        output+=os.read(process.stdout.fileno(),8192).decode()
                        if 'foreground_owned_only' in output:break
                    if process.poll() is not None:break
                self.assertIn('foreground_owned_only',output)
                process.send_signal(signal.SIGINT);out,err=process.communicate(timeout=10)
                self.assertEqual(process.returncode,0,err+out)
                for port in ports:
                    with socket.socket() as sock:self.assertNotEqual(sock.connect_ex(('127.0.0.1',port)),0)
            finally:
                if process.poll() is None:process.send_signal(signal.SIGTERM);process.wait(timeout=10)
                process.stdout.close();process.stderr.close()

    def test_real_owned_group_reaps_parent_and_stops_child(self):
        script='import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]); print(p.pid,flush=True); time.sleep(60)'
        parent=subprocess.Popen([sys.executable,'-c',script],start_new_session=True,stdout=subprocess.PIPE,text=True)
        try:
            child_pid=int(parent.stdout.readline()); self.assertEqual(os.getpgid(child_pid),parent.pid)
            s=self.w.Supervisor({}); s.processes['api']=parent
            with patch.object(self.w,'activity',return_value=[]): self.assertTrue(s.stop())
            self.assertIsNotNone(parent.poll())
            for _ in range(40):
                stat=subprocess.run(['ps','-p',str(child_pid),'-o','stat='],capture_output=True,text=True).stdout.strip()
                if not stat or stat.startswith('Z'): break
                time.sleep(.05)
            self.assertTrue(not stat or stat.startswith('Z'),stat)
        finally:
            if parent.poll() is None: os.killpg(parent.pid,signal.SIGTERM);parent.wait(timeout=3)
            parent.stdout.close()


if __name__=='__main__': unittest.main()
