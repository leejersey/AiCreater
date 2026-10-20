"""Check the 20 fixed teaching deliverables, never generate or make paid calls."""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from services.projects.store import final_valid, validator


def load_cases():
    cases = json.loads((ROOT / 'examples/acceptance/cases.json').read_text())
    if len(cases) != 20 or len({c['id'] for c in cases}) != 20:
        raise ValueError('invalid_corpus')
    for case in cases:
        if (not re.fullmatch(r'[a-z][a-z0-9-]{0,40}', case['id']) or not 1 <= len(case['script']) <= 4000
                or not case['review'] or case['domain'] not in ['programming', 'ai']
                or case['type'] not in validator.SCHEMA['definitions']['Scene']['properties']['type']['enum']
                or (case['domain'] == 'programming' and case.get('language') not in ['python', 'javascript', 'typescript'])):
            raise ValueError('invalid_corpus')
    return cases


def check_case(case, directory, public):
    result = {'id': case['id'], 'status': 'failed', 'review': case['review']}
    if directory.is_symlink(): return {**result, 'code': 'unsafe_path'}
    directory = directory.parent.resolve() / directory.name
    files = [directory / name for name in ['project.json', 'video.mp4', 'video.srt']]
    if not all(file.is_file() for file in files): return {**result, 'code': 'missing_artifacts'}
    if any(file.resolve() != file.absolute() for file in files): return {**result, 'code': 'unsafe_path'}
    if any(not 0 < file.stat().st_size <= limit for file, limit in zip(files, [512*1024, 1024**3, 2*1024**2])):
        return {**result, 'code': 'size_limit'}
    try:
        document = json.loads(files[0].read_text(encoding='utf-8-sig'))
        final_valid(document)
        if ''.join(scene['narration']['text'] for scene in document['scenes']) != case['script']:
            return {**result, 'code': 'script_changed'}
        teaching = [scene for scene in document['scenes'] if scene['type'] == case['type']]
        if not teaching or ('language' in case and not any(scene['code']['language'] == case['language'] for scene in teaching)):
            return {**result, 'code': 'teaching_template_missing'}
        # Use the same bounded, non-code-executing asset/video/subtitle gates as production.
        env = {key: value for key, value in os.environ.items() if key in ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'TZ']}
        for script, argument in [('verify-project.ts', public), ('verify-render.ts', directory)]:
            subprocess.run([str(ROOT / 'node_modules/.bin/tsx'), str(ROOT / 'scripts' / script), str(argument)],
                           input=json.dumps(document).encode(), env=env, check=True, capture_output=True, timeout=120)
        return {**result, 'status': 'passed', 'frames': sum(scene['duration_frames'] for scene in document['scenes']),
                'checks': ['original_script', 'teaching_template', 'assets', 'video', 'snapshot_subtitles']}
    except Exception:
        return {**result, 'code': 'deliverable_validation_failed'}


def summarize(results):
    passed = sum(result['status'] == 'passed' for result in results)
    return {'total': len(results), 'passed': passed, 'structural_passed': len(results) == 20 and passed >= 18,
            'formal_acceptance': 'pending', 'paid_calls': 0,
            'pending': ['real_provider_provenance', 'end_to_end_900_seconds', 'teaching_facts_and_screenshots', 'synchronization_listening'],
            'results': results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', required=True, help='Directory containing <case-id>/{project.json,video.mp4,video.srt}')
    parser.add_argument('--report', required=True, help='New JSON report, never overwritten')
    args = parser.parse_args()
    report = Path(args.report)
    if report.exists() or report.is_symlink():
        print(json.dumps({'code': 'report_exists'})); return 1
    try:
        cases = load_cases()
        results = [check_case(case, Path(args.results).resolve() / case['id'], ROOT / 'apps/renderer/public') for case in cases]
        summary = summarize(results)
        report.parent.mkdir(parents=True, exist_ok=True)
        with report.open('x', encoding='utf-8') as output: json.dump(summary, output, ensure_ascii=False, indent=2)
        print(json.dumps({key: value for key, value in summary.items() if key != 'results'}))
        return 0 if summary['structural_passed'] else 1
    except Exception:
        print(json.dumps({'code': 'acceptance_check_failed'})); return 1


if __name__ == '__main__': sys.exit(main())
