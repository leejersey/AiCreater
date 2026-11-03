"""Keep live Compose and disposable integration tests on the same verified images."""
import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POSTGRES = 'postgres:16.13@sha256:5a65324fe84dc41709ff914e90b07f3e2f577073ed27bf917d4873aca0c9ec51'
REDIS = 'redis:7.4.8-alpine@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065'


class ContainerImageTests(unittest.TestCase):
    def test_compose_pins_both_current_images(self):
        images = re.findall(r'^    image: (\S+)\s*$', (ROOT / 'compose.postgres.yaml').read_text(), re.M)
        self.assertEqual(images, [POSTGRES, REDIS])

    def test_repository_tests_use_the_same_postgres(self):
        tree = ast.parse((ROOT / 'services/tests/run_project_tests.py').read_text())
        images = [node.value for node in ast.walk(tree) if isinstance(node, ast.Constant)
                  and isinstance(node.value, str) and node.value.startswith('postgres:')]
        self.assertEqual(images, [POSTGRES])


if __name__ == '__main__': unittest.main()
