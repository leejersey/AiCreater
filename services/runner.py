"""The job runner: asks PostgreSQL for queued work every 2 s and runs it, one job at a time per lane.

  python -m services.runner                  # both lanes (workflow: voice, timing, Agent; render: export, restyle)
  python -m services.runner --lane render    # one lane

The database owns queueing, leases, retries and cancellation (services/projects/leases.py); several runners, even on
other machines, coordinate through it. Only jobs a person confirmed in the web app are ever queued.
Ctrl+C or SIGTERM: finish the current job, then exit. A second one aborts the job (it fails, never retried)."""
import argparse
import os
import signal
import subprocess
import sys
import time

from services.config import ROOT, load_local_config

LANES = ('workflow', 'render')
IDLE_SECONDS = 2
STORAGE_RETRY_SECONDS = 600  # render lane, while idle: re-upload published files whose upload failed


def open_store():
    from services.projects.manage import profile
    from services.projects.storage import ObjectStore
    from services.projects.store import Store
    dsn = os.environ.get('DATABASE_URL')
    if not dsn: raise SystemExit('Configure DATABASE_URL in .env.local-services')
    store = Store(dsn, ROOT / 'apps/renderer/public', profile(), objects=ObjectStore.from_env())
    store.initialize()
    return store


def poll(store, lane):
    """Runs the oldest queued job of `lane` and returns it, or None when there is nothing to do."""
    from services.projects.jobs import Jobs
    from services.visual.store import VisualJobs
    from services.visual.worker import run_once as visual_run_once
    from services.workflow.worker import run_once
    result = visual_run_once(VisualJobs(store), lane=lane)
    if result is None: result = run_once(Jobs(store, model=os.environ.get('DEEPSEEK_MODEL', 'deepseek-flash')), lane=lane)
    return result


def serve(lane):
    stopping = []
    def stop(signum, frame):
        if stopping: raise KeyboardInterrupt  # second signal: abort the running job
        stopping.append(signum)
        print(f'runner {lane}: stopping after the current job (signal again to abort it)', flush=True)
    signal.signal(signal.SIGINT, stop); signal.signal(signal.SIGTERM, stop)
    store = open_store()
    print(f'runner {lane}: ready', flush=True)
    retried = 0.0
    while not stopping:
        if lane == 'workflow':
            # Course pipelines the person confirmed: submit their next step when nothing of theirs is running.
            try:
                from services.visual.autopilot import Autopilot
                for step in Autopilot(store).advance(): print(f'runner {lane}: pipeline {step[0]} {step[1]}', flush=True)
            except Exception as error:
                print(f'runner {lane}: pipeline step failed ({type(error).__name__}); retrying', file=sys.stderr, flush=True)
        try: result = poll(store, lane)
        except KeyboardInterrupt: break
        except Exception as error:  # a broken poll (database restart, …) must not end the runner
            print(f'runner {lane}: poll failed ({type(error).__name__}); retrying', file=sys.stderr, flush=True)
            result = None
        if result: print(f'runner {lane}: job {result["id"]} {result["state"]}', flush=True)
        elif lane == 'render' and time.monotonic() - retried >= STORAGE_RETRY_SECONDS:
            retried = time.monotonic()
            try:
                from services.visual.store import VisualJobs
                from services.visual.worker import retry_storage
                stored, pending = retry_storage(VisualJobs(store))
                if stored or pending: print(f'runner {lane}: object storage retry stored {stored}, pending {pending}', flush=True)
            except Exception as error:
                print(f'runner {lane}: object storage retry failed ({type(error).__name__})', file=sys.stderr, flush=True)
        elif not stopping: time.sleep(IDLE_SECONDS)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--lane', choices=LANES)
    args = parser.parse_args(argv)
    load_local_config()
    if args.lane: return serve(args.lane)
    # One process per lane, so a long export never waits behind an Agent run. Each lane has its own process group and
    # gets every signal exactly once, from here: one means finish the job, a second means abort it.
    children = [subprocess.Popen([sys.executable, '-m', 'services.runner', '--lane', lane], cwd=ROOT, start_new_session=True) for lane in LANES]
    def forward(signum, frame):
        for child in children:
            if child.poll() is None: child.send_signal(signum)
    signal.signal(signal.SIGTERM, forward); signal.signal(signal.SIGINT, forward)
    while any(child.poll() is None for child in children): time.sleep(0.5)
    return max(child.returncode or 0 for child in children)


if __name__ == '__main__': sys.exit(main())
