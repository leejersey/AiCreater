import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock,patch
from services.projects.store import StoreError


class TeachingRuntimeTests(unittest.TestCase):
    def test_admission_requires_independent_heartbeats_foundations_and_local_image(self):
        from services.visual.teaching_runtime import require_ready
        with patch('services.visual.teaching_runtime.WorkerHealth') as health,patch('services.visual.teaching_runtime.basic_ready') as foundations,patch('services.visual.teaching_runtime.subprocess.run',return_value=SimpleNamespace(returncode=0)) as docker:
            require_ready(MagicMock())
            health.return_value.require_ready.assert_called_once_with(('teaching-plan','teaching-render','scheduler'))
            foundations.assert_called_once();self.assertEqual(docker.call_args.args[0][:3],['docker','image','inspect'])
            self.assertNotIn('pull',docker.call_args.args[0]);self.assertNotIn('DEEPSEEK_API_KEY',docker.call_args.kwargs['env'])

    def test_any_missing_dependency_is_sanitized_and_never_starts_services(self):
        from services.visual.teaching_runtime import require_ready
        for point in ('health','foundations','image'):
            with self.subTest(point=point),patch('services.visual.teaching_runtime.WorkerHealth') as health,patch('services.visual.teaching_runtime.basic_ready') as foundations,patch('services.visual.teaching_runtime.subprocess.run',return_value=SimpleNamespace(returncode=0)) as docker:
                if point=='health':health.return_value.require_ready.side_effect=RuntimeError('private key')
                elif point=='foundations':foundations.side_effect=RuntimeError('private key')
                else:docker.return_value.returncode=1
                with self.assertRaises(StoreError) as error:require_ready(MagicMock())
                self.assertEqual(error.exception.code,'teaching_unavailable');self.assertNotIn('private',str(error.exception))
