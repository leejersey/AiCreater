"""Independent, model-free teaching renderer; PostgreSQL owns admission."""


def run_once(renders):
    candidate=renders.next_queued()
    cleaned=renders.reconcile_one()
    if candidate is None: return cleaned
    result=renders.run(candidate['project_id'],candidate['root_id'])
    if result['state']=='failed' and result['error_code']=='render-failed':
        from services.visual.teaching_render_repairs import TeachingRenderRepairs
        from services.projects.store import StoreError
        try:TeachingRenderRepairs(renders.store).prepare(candidate['project_id'],candidate['root_id'],result['id'])
        except (StoreError,OSError):pass # Original failure remains authoritative; never dispatch from the render lane.
    return result


def main():
    import argparse
    import json
    import os
    from pathlib import Path
    from services.projects.store import Store, StoreError
    from services.projects.manage import profile
    from services.visual.teaching_renders import TeachingRenders
    parser=argparse.ArgumentParser(description='Explicit single teaching render wake-up; normal polling uses the existing Celery render lane.')
    parser.add_argument('--once',action='store_true',required=True)
    parser.add_argument('--public',type=Path,required=True)
    args=parser.parse_args()
    if not os.environ.get('DATABASE_URL'): parser.error('DATABASE_URL must be configured in the worker environment')
    settings=profile()
    settings['voice']={key:value or 'teaching-no-voice' for key,value in settings['voice'].items()}
    try:
        result=run_once(TeachingRenders(Store(os.environ['DATABASE_URL'],args.public,settings)))
        print(json.dumps({'state':result['state'],'job_id':result['id']} if result else {'state':'idle'}))
    except StoreError:
        print(json.dumps({'state':'worker-error'}));return 1
    return 0


if __name__=='__main__':
    raise SystemExit(main())
