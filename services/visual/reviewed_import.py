"""Local maintenance import of an already executed, human-reviewed model response.

Never dispatches providers or renderers. Existing repair/preview records retain the
historical request count; the import itself has zero new requests.
"""
import argparse
import copy
import hashlib
import json
import os
import re
from pathlib import Path
import stat
import subprocess
import tempfile
import uuid

from psycopg.types.json import Jsonb
from services.projects.store import ROOT, StoreError, identifier, revision
from services.visual.contract import measured_input
from services.visual.store import VisualJobs, HASH


def register_verified_import(store, project_id, scene_id, expected_revision, measured,
                             verified, import_key, publish, confirmed):
    VisualJobs._approval(confirmed, verified.get('sha256'))
    if (type(verified.get('requests_dispatched')) is not int or verified['requests_dispatched'] != 1 or
            type(verified.get('new_requests')) is not int or verified['new_requests'] != 0 or
            verified.get('accepted') is not False or not isinstance(import_key,str) or not HASH.fullmatch(import_key)):
        raise ValueError('Reviewed import requires real historical accounting and zero new requests')
    origin=verified.get('origin','local-reviewed-model-execution')
    if origin not in ('local-reviewed-model-execution','local-reviewed-offline-revision'):
        raise ValueError('Unsupported reviewed source origin')
    revision(expected_revision); jobs=VisualJobs(store)
    with store.connection() as conn:
        project=store._read(conn,identifier(project_id),lock=True)
        row=store._scene(project,identifier(scene_id))
        if project['revision']!=expected_revision or measured_input(project,row)!=measured:
            raise StoreError('conflict','Reviewed import snapshot is stale')
        if verified['artifact']['brief']!=measured['brief'] or verified['design'].get('cues')!=measured['cues']:
            raise StoreError('conflict','Reviewed source no longer matches this measured chapter')
        existing=[jobs._raw(r) for r in conn.execute("""SELECT * FROM visual_jobs WHERE project_id=%s AND scene_id=%s
            AND input->>'reviewed_import_key'=%s ORDER BY kind""",[project_id,scene_id,import_key]).fetchall()]
        if existing:
            if len(existing)!=2 or {r['kind'] for r in existing}!={'repair','preview'}:
                raise StoreError('conflict','Incomplete reviewed import receipt')
            gen=next(r for r in existing if r['kind']=='repair');preview=next(r for r in existing if r['kind']=='preview')
            if any(r['state']!='succeeded' or not jobs._current(conn,project,r) for r in existing):
                raise StoreError('conflict','Existing reviewed import is stale')
            results=publish(gen['id'],preview['id'],reuse=True)
            for prior,current in zip((gen,preview),results):
                if any(prior['result'].get(k)!=current.get(k) for k in ('sha256','design_sha256','_files')):
                    raise StoreError('conflict','Existing reviewed import files changed')
            return {'generation':jobs._public(gen,True),'preview':jobs._public(preview,True),'reused':True}
        gid,pid=str(uuid.uuid4()),str(uuid.uuid4())
        gen_result,preview_result=publish(gid,pid,reuse=False)
        data={**copy.deepcopy(measured),'generation_mode':'source','reviewed_import_key':import_key,
              'reviewed_import':{'origin':origin,'new_requests':0,'historical_requests':1}}
        preview_data={**copy.deepcopy(measured),'generation_id':gid,'sha256':verified['sha256'],'reviewed_import_key':import_key}
        gen={'kind':'repair','state':'succeeded','input':data}
        preview={'kind':'preview','state':'succeeded','input':preview_data,'result':preview_result}
        if (not jobs._valid_result(gen,gen_result) or not jobs._valid_result(preview,preview_result) or not jobs._acceptable(preview) or
                gen_result.get('sha256')!=verified['sha256'] or preview_result.get('sha256')!=verified['sha256'] or
                gen_result.get('design_sha256')!=verified['design_sha256'] or preview_result.get('design_sha256')!=verified['design_sha256']):
            raise StoreError('validation','Reviewed import result failed existing publication gates')
        for job_id,kind,inputs,result,stage in (
            (gid,'repair',data,gen_result,'离线修订稿登记：父稿历史模型1次，本次0次' if origin=='local-reviewed-offline-revision' else '已执行稿登记：历史模型1次，本次0次'),
            (pid,'preview',preview_data,preview_result,'已认可预览登记：本次未重新渲染')):
            result=copy.deepcopy(result);result.pop('accepted',None)
            conn.execute("""INSERT INTO visual_jobs(id,project_id,scene_id,kind,state,stage,input,result,started_at,ended_at)
                VALUES (%s,%s,%s,%s,'succeeded',%s,%s,%s,now(),now())""",
                [job_id,project_id,scene_id,kind,stage,Jsonb(inputs),Jsonb(result)])
        gen=jobs._read(conn,project_id,gid);preview=jobs._read(conn,project_id,pid)
        if not jobs._current(conn,project,gen) or not jobs._current(conn,project,preview):
            raise StoreError('conflict','Imported preview parent is not current')
        return {'generation':jobs._public(gen,True),'preview':jobs._public(preview,True),'reused':False}


def _bytes(file,maximum=256*1024):
    file=Path(file).absolute()
    if file.resolve()!=file:raise ValueError('Symlink evidence is not allowed')
    fd=os.open(file,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as handle:
        info=os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0<info.st_size<=maximum:raise ValueError('Invalid evidence file')
        data=handle.read(maximum+1)
    if len(data)>maximum:raise ValueError('Evidence exceeds limit')
    return data


def _json(file):
    return json.loads(_bytes(file),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Non-JSON number')))


def _digest(data):return hashlib.sha256(data).hexdigest()


def _write(file,value):
    data=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False,allow_nan=False,indent=2).encode()
    with Path(file).open('xb') as handle:handle.write(data)
    os.chmod(file,0o600)


def assert_snapshot_revision(snapshot,measured,project_id,scene_id,scene_revision):
    if (not isinstance(snapshot,dict) or snapshot.get('scene')!=measured['scene'] or snapshot.get('asset')!=measured['asset'] or
            snapshot.get('scene_id')!=scene_id or snapshot.get('project_id')!=project_id or
            type(snapshot.get('scene_revision')) is not int or snapshot['scene_revision']!=scene_revision):
        raise StoreError('conflict','Diagnostic preview belongs to another or stale scene revision')


def import_local_reviewed(store,project_id,scene_id,source_directory,preview_directory,sha256,video_sha256,confirmed,*,offline_revision=False):
    VisualJobs._approval(confirmed,sha256);VisualJobs._approval(confirmed,video_sha256)
    source,preview=Path(source_directory).absolute(),Path(preview_directory).absolute()
    for directory in (source,preview):
        if directory.resolve()!=directory or not directory.is_dir() or not directory.is_relative_to(ROOT/'output'):
            raise ValueError('Reviewed import requires ordinary repository output directories')
    stills=source/'stills-v1';project=store.get_project(project_id);row=store._scene(project,scene_id)
    measured=measured_input(project,row);report=_json(stills/'report.json')
    audio=store.asset_file(project_id,measured['asset']['id'])
    if _digest(_bytes(audio,128*1024**2))!=measured['asset']['checksum']:raise ValueError('Current audio changed')
    if _digest(_bytes(preview/'chapter-0/audio.wav',128*1024**2))!=measured['asset']['checksum']:raise ValueError('Frozen audio differs from current audio')
    if _digest(_bytes(preview/'video.mp4',512*1024**2))!=video_sha256:raise ValueError('Approved video changed')
    snapshot=_json(preview/'input-snapshot.json')
    assert_snapshot_revision(snapshot,measured,project_id,scene_id,row['revision'])
    probe=json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height,nb_frames,r_frame_rate','-of','json',str(preview/'video.mp4')],check=True,capture_output=True,text=True,timeout=30).stdout)
    if (abs(float(probe['format']['duration'])-measured['brief']['durationInFrames']/30)>.1 or
            not any(s.get('codec_type')=='audio' for s in probe['streams']) or
            not any(s.get('codec_type')=='video' and s.get('width')==1920 and s.get('height')==1080 and s.get('r_frame_rate')=='30/1' and s.get('nb_frames')==str(measured['brief']['durationInFrames']) for s in probe['streams'])):
        raise ValueError('Diagnostic media stream/duration mismatch')
    from services.visual.worker import child_environment,job_directory,publishable_result
    env=child_environment('recover-source')
    def verify(s,p,t):
        with tempfile.TemporaryDirectory(prefix='.reviewed-import-',dir=ROOT) as temp:
            config=Path(temp)/'input.json'
            _write(config,{'source_directory':str(s),'preview_directory':str(p),'stills_directory':str(t),'sha256':sha256,'measured':measured,
                          'source_origin':'local-reviewed-offline-revision' if offline_revision else 'local-reviewed-model-execution'})
            result=subprocess.run([str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/verify-reviewed-import.ts'),str(config)],
                cwd=ROOT,env=env,capture_output=True,text=True,timeout=60)
            if result.returncode or len(result.stdout.encode())>512*1024:raise ValueError('Canonical reviewed import verification failed')
            return json.loads(result.stdout)
    verified=verify(source,preview,stills)
    receipt={'project_id':project_id,'scene_id':scene_id,'fingerprint':measured['fingerprint'],'sha256':sha256,'video_sha256':video_sha256,
             'provider_sha256':_digest(_bytes(source/'provider-response.json')),'geometry_sha256':_digest(_bytes(stills/'report.json'))}
    if offline_revision:receipt['origin']='local-reviewed-offline-revision'
    key=_digest(json.dumps(receipt,sort_keys=True,separators=(',',':')).encode())
    gen_buffers={name:_bytes(source/name) for name in ('artifact.json','artifact.json.design.json','provider-response.json','dispatch.json','request.json')}
    if offline_revision:
        gen_buffers['offline-revision.json']=_bytes(source/'offline-revision.json')
        if _json(source/'offline-revision.json').get('parentDesignSha256') is not None:
            gen_buffers['parent-design.json']=_bytes(source/'parent-design.json')
            receipt['parent_design_file_sha256']=_digest(gen_buffers['parent-design.json'])
        receipt['offline_revision_sha256']=_digest(gen_buffers['offline-revision.json'])
        key=_digest(json.dumps(receipt,sort_keys=True,separators=(',',':')).encode())
    preview_buffers={name:_bytes(preview/name,512*1024**2 if name=='video.mp4' else 128*1024**2 if name.endswith('.wav') else 256*1024)
                     for name in ('video.mp4','video.srt','composition.json','chapter-0/artifact.json','chapter-0/artifact.json.design.json','chapter-0/audio.wav')}
    pngs={}
    for name in report['frames']:
        if not isinstance(name,str) or not re.fullmatch(r'frame-\d+\.png',name):raise ValueError('Invalid still name')
        data=_bytes(stills/name,16*1024**2)
        if _digest(data)!=report['frameHashes'].get(name):raise ValueError('Still image changed')
        pngs[name]=data
    def publish(gid,pid,reuse=False):
        g,p=job_directory(gid),job_directory(pid)
        if not reuse:
            g.parent.mkdir(exist_ok=True)
            if g.parent.resolve()!=g.parent:raise ValueError('Invalid workbench output root')
            g.mkdir(mode=0o700);p.mkdir(mode=0o700);(p/'stills').mkdir(mode=0o700);(p/'chapter-0').mkdir(mode=0o700)
            for name,data in gen_buffers.items():_write(g/name,data)
            _write(g/'source.txt',verified['artifact']['source'].encode());_write(g/'design.json',verified['design'])
            _write(g/'frozen-design.json',verified['design']);_write(g/'generation-mode.json',{'generation_mode':'source'})
            _write(g/'request-count.json',{'requests_dispatched':1});_write(g/'provider-1.json',gen_buffers['provider-response.json'])
            for name,data in preview_buffers.items():_write(p/name,data)
            for name,data in pngs.items():_write(p/'stills'/name,data)
            _write(p/'stills/report.json',report)
            gen={'sha256':sha256,'design_sha256':verified['design_sha256'],'source':verified['artifact']['source'],
                 'rationale':verified['artifact']['rationale'],'design':verified['design'],'requests_dispatched':1,'generation_mode':'source'}
            frames=['stills/'+n for n in report['frames']]
            pv={'sha256':sha256,'design_sha256':verified['design_sha256'],'geometry':report['geometry'],'frames':frames,
                'frame_hashes':{'stills/'+n:_digest(data) for n,data in pngs.items()},'video':'video.mp4','srt':'video.srt','requests_dispatched':0}
            _write(g/'result.json',gen);_write(p/'result.json',pv)
            for directory in (g,p):_write(directory/'import-receipt.json',{**receipt,'key':key,'new_requests':0,'historical_requests':1})
        verify(g,p,p/'stills')
        for name,data in gen_buffers.items():
            if _digest(_bytes(g/name))!=_digest(data):raise ValueError('Frozen imported provenance changed')
        if _digest(_bytes(p/'video.mp4',512*1024**2))!=video_sha256 or _digest(_bytes(p/'chapter-0/audio.wav',128*1024**2))!=measured['asset']['checksum']:
            raise ValueError('Frozen imported media changed')
        for name,data in pngs.items():
            if _digest(_bytes(p/'stills'/name,16*1024**2))!=_digest(data):raise ValueError('Frozen imported still changed')
        return publishable_result({'kind':'repair','input':{'generation_mode':'source'}},g),publishable_result({'kind':'preview','input':{'sha256':sha256}},p)
    return register_verified_import(store,project_id,scene_id,project['revision'],measured,verified,key,publish,confirmed)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ('project','scene','source_directory','preview_directory','sha256','video_sha256'):parser.add_argument('--'+key.replace('_','-'),required=True)
    parser.add_argument('--confirm',action='store_true');parser.add_argument('--accept',action='store_true')
    parser.add_argument('--offline-revision',action='store_true',help='Explicitly register a hash-bound offline revision while retaining the original provider response')
    args=parser.parse_args()
    from services.workbench import trusted_config
    os.environ.update(trusted_config())
    from services.projects.store import Store
    from services.projects.manage import profile
    from services.projects.storage import ObjectStore
    store=Store(os.environ['DATABASE_URL'],ROOT/'apps/renderer/public',profile(),objects=ObjectStore.from_env())
    result=import_local_reviewed(store,args.project,args.scene,args.source_directory,args.preview_directory,args.sha256,args.video_sha256,args.confirm,offline_revision=args.offline_revision)
    if args.accept:result['preview']=VisualJobs(store).accept(args.project,result['preview']['id'],True,args.sha256)
    print(json.dumps({'generation_id':result['generation']['id'],'preview_id':result['preview']['id'],'accepted':result['preview']['accepted'],
                      'current':result['preview']['current'],'reused':result['reused'],'new_model_requests':0,'new_voice_requests':0},ensure_ascii=False))


if __name__=='__main__':main()
