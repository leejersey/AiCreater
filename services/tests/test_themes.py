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


    def test_a_course_accent_replaces_the_accent_and_its_translucent_fill(self):
        theme = themes.snapshot('chalk-garden', '#7dd3fc')
        self.assertEqual((theme['colors']['accent'], theme['colors']['accentSoft']), ('#7dd3fc', '#7dd3fc24'))
        self.assertEqual(themes.snapshot('chalk-garden')['colors']['accent'], '#facc15')
        self.assertIsNone(themes.check_accent('blueprint', None))
        with self.assertRaises(StoreError): themes.check_accent('blueprint', '#10203a')  # dark on dark
        self.assertEqual(round(themes.contrast('#000000', '#ffffff')), 21)


if __name__ == '__main__': unittest.main()
