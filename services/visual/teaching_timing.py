"""Measured timeline rebinding only. No provider calls, estimation or source generation."""
import copy
import hashlib
import json
import math
import os
import subprocess

from services.projects.store import StoreError
from services.visual.contract import measured_input
from services.visual.teaching_tasks import checksum, fingerprint


def measured_timeline(source, project, row):
    if not isinstance(source,dict):raise StoreError('validation','Invalid teaching snapshot')
    data=measured_input(project,row)
    brief=data['brief'];original=source.get('brief',{})
    if source.get('generation_mode')!='teaching-plan' or {k:v for k,v in original.items() if k!='durationInFrames'}!={k:v for k,v in brief.items() if k!='durationInFrames'}:
        raise StoreError('conflict','Teaching content changed; cannot rebind existing semantics')
    asset=data['asset'];checksum(asset.get('checksum'))
    duration_ms=asset.get('duration_ms');offset=data['scene']['narration'].get('audio_start_frame')
    if asset.get('type')!='audio' or type(duration_ms) is not int or not 0<duration_ms<=120000 or type(offset) is not int or offset<0:
        raise StoreError('validation','Invalid measured audio binding')
    if offset+(duration_ms*30+999)//1000>brief['durationInFrames']:
        raise StoreError('validation','Measured audio exceeds chapter timeline')
    if data['scene']['captions'][0]['start_frame']<offset or data['scene']['captions'][-1]['end_frame']>offset+(duration_ms*30+999)//1000:
        raise StoreError('validation','Measured captions exceed audio interval')
    normalize=lambda text:''.join(text.split())
    track=source.get('cues')
    if not isinstance(track,list) or not track or len(track)>30:
        raise StoreError('validation','Invalid source cue track')
    starts={};ends={};cursor=0
    for caption in data['scene']['captions']:
        count=len(normalize(caption['text']))
        if count==0:raise StoreError('validation','Empty measured caption')
        starts[cursor]=caption['start_frame'];cursor+=count;ends[cursor]=caption['end_frame']
    cues=[];cursor=0;ids=set();previous=0
    for cue in track:
        if not isinstance(cue,dict) or set(cue)!={'id','text','startFrame','endFrame'} or not isinstance(cue['id'],str) or not cue['id'] or cue['id'] in ids or not isinstance(cue['text'],str):
            raise StoreError('validation','Invalid source cue identity')
        if type(cue['startFrame']) is not int or type(cue['endFrame']) is not int or not previous<=cue['startFrame']<cue['endFrame']<=original['durationInFrames']:
            raise StoreError('validation','Invalid source cue timing')
        ids.add(cue['id']);previous=cue['endFrame'];right=cursor+len(normalize(cue['text']))
        if not cursor<right or cursor not in starts or right not in ends:
            raise StoreError('unsupported','Cue boundary has no measured timestamp; no estimated alignment used')
        cues.append({**cue,'startFrame':starts[cursor],'endFrame':ends[right]});cursor=right
    if ''.join(normalize(c['text']) for c in cues)!=normalize(brief['narration']):
        raise StoreError('conflict','Source cue content does not match measured narration')
    media={'timing_mode':'measured','fingerprint':data['fingerprint'],'scene_revision':row['revision'],
        'asset':copy.deepcopy(asset),'captions':copy.deepcopy(data['scene']['captions']),'audio_start_frame':offset}
    result={'schemaVersion':'teaching-measured-timeline:1','source_snapshot_sha256':fingerprint(source),
        'brief':copy.deepcopy(brief),'cues':cues,'media':media,'model_calls':0}
    return {**result,'timeline_sha256':fingerprint(result)}


def bind_teaching_audio(source, artifact, expected_sha256, project, row):
    from services.visual.teaching_pipeline import host_command
    checksum(expected_sha256)
    if not isinstance(source,dict) or not isinstance(artifact,dict) or artifact.get('brief')!=source.get('brief') or artifact.get('cues')!=source.get('cues'):
        raise StoreError('conflict','Artifact does not match the source timeline')
    timeline=measured_timeline(source,project,row)
    result=host_command('retime',{'artifact':artifact,'expectedSha256':expected_sha256,
        'brief':timeline['brief'],'cues':timeline['cues']})
    if result.get('schemaVersion')!='teaching-retime:1' or result.get('sourceArtifactSha256')!=expected_sha256 or result.get('modelCalls')!=0:
        raise StoreError('validation','Invalid host retiming result')
    rebound=result['artifact'];checksum(rebound.get('artifactSha256'));checksum(result.get('semanticSha256'))
    if rebound.get('brief')!=timeline['brief'] or rebound.get('cues')!=timeline['cues']:
        raise StoreError('conflict','Recompiled artifact does not match measured timeline')
    package={'schemaVersion':'teaching-audio-binding:1','source_artifact_sha256':expected_sha256,
        'semantic_sha256':result['semanticSha256'],'timeline':timeline,'artifact':rebound,
        'model_calls':0,'accepted':False,'execution':'not-run','media_verification':'metadata-only'}
    # Byte verification and media rendering are separate gates; metadata is not playable output.
    return {**package,'binding_sha256':fingerprint(package,8*1024*1024)}


def verify_bound_audio(store, project_id, timeline):
    if not isinstance(timeline,dict) or timeline.get('schemaVersion')!='teaching-measured-timeline:1':
        raise StoreError('validation','Invalid measured timeline')
    digest=checksum(timeline.get('timeline_sha256'))
    if fingerprint({k:v for k,v in timeline.items() if k!='timeline_sha256'})!=digest:
        raise StoreError('conflict','Measured timeline changed')
    asset=timeline['media']['asset']
    project=store.get_project(project_id)
    if next((a for a in project['config']['assets'] if a['id']==asset['id']),None)!=asset:
        raise StoreError('conflict','Measured audio asset changed')
    file=store.asset_file(project_id,asset['id'])
    try:
        if not 0<file.stat().st_size<=50*1024*1024 or hashlib.sha256(file.read_bytes()).hexdigest()!=asset['checksum']:
            raise ValueError()
        child=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type',
            '-of','json',str(file)],capture_output=True,text=True,check=True,timeout=30,
            env={k:os.environ[k] for k in ('PATH','HOME') if k in os.environ})
        if len(child.stdout.encode())>128*1024:raise ValueError()
        probe=json.loads(child.stdout);seconds=float(probe['format']['duration'])
        if not math.isfinite(seconds) or not 0<seconds<=120 or [s.get('codec_type') for s in probe['streams']]!=['audio']:
            raise ValueError()
        duration=math.ceil(seconds*1000)
        if abs(duration-asset['duration_ms'])>1 or hashlib.sha256(file.read_bytes()).hexdigest()!=asset['checksum']:
            raise ValueError()
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):
        raise StoreError('assets','Bound teaching audio failed byte or media verification') from None
    return {'schemaVersion':'teaching-audio-verification:1','timeline_sha256':digest,
        'audio_sha256':asset['checksum'],'duration_ms':duration,'model_calls':0,'accepted':False}
