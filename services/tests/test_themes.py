import unittest

from services import themes
from services.projects.store import StoreError


class ThemeRegistryTests(unittest.TestCase):
    def test_courses_from_before_themes_use_the_default(self):
        self.assertEqual(themes.effective({}), 'blueprint')
        self.assertEqual(themes.effective({'theme_id': 'removed-theme'}), 'blueprint')
        self.assertEqual(themes.effective({'theme_id': 'chalk-garden'}), 'chalk-garden')

    def test_snapshots_are_copies_of_the_theme_files(self):
        snapshot = themes.snapshot('blueprint')
        snapshot['colors']['background'] = '#000000'
        self.assertEqual(themes.snapshot('blueprint')['colors']['background'], '#0e1a2e')
        with self.assertRaises(StoreError): themes.snapshot('../blueprint')
        with self.assertRaises(StoreError): themes.require(None)


if __name__ == '__main__': unittest.main()
