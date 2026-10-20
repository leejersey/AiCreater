import copy
import unittest
from services.tests.test_generation import outline, quoted_wire
from services.workflow.storyboard import validate_storyboard, restore_storyboard, source_parts, validator
from services.workflow.providers import ProviderError
from services.tts.timing import time_scene, align_words


class VisualStylesTests(unittest.TestCase):
    def test_graphic_fields_survive_quote_restoration_and_timing(self):
        draft=outline('规则匹配。');element=draft['scenes'][0]['elements'][0]
        element.update(icon='document',step=1,highlight={'text_start':0,'text_end':2},source_label='规则',panel_style='conclusion')
        validate_storyboard(draft,'规则匹配。')
        restored=restore_storyboard(quoted_wire(draft),'规则匹配。',source_parts('规则匹配。'),require_quotes=True)
        self.assertEqual(restored,draft)
        timed=time_scene(restored['scenes'][0],'audio',1000,align_words('规则匹配。',[{'word':'规则匹配。','startTime':0,'endTime':1}],1000))
        self.assertEqual(timed['elements'],draft['scenes'][0]['elements'])
        self.assertGreaterEqual(timed['animations'][0]['start_frame'],6)

    def test_display_fields_are_unicode_bounded_and_source_owned(self):
        for fields in [dict(icon='<svg>'),dict(step=True),dict(step=10),dict(source_label='不存在'),dict(source_label='\u200b规则'),dict(highlight={'text_start':0,'text_end':5}),dict(highlight={'text_start':2,'text_end':1}),dict(panel_style='topic')]:
            draft=outline();draft['scenes'][0]['elements'][0].update(fields)
            with self.subTest(fields=fields),self.assertRaises(ProviderError):validate_storyboard(draft,'规则匹配。')
        draft=outline('😀规则。');draft['scenes'][0]['elements'][0].update(content='😀规则',highlight={'text_start':0,'text_end':1})
        validate_storyboard(draft,'😀规则。')

    def test_three_new_themes_and_legacy_validate(self):
        import json
        from services.workflow.storyboard import ROOT
        raw=json.loads((ROOT/'examples/demo.json').read_text())
        for theme in ['tech_explainer','tech_multicolor','light_teaching','color_infographic']:
            raw['theme']=theme
            self.assertEqual(validator.validate_project(raw),[],theme)
        raw['theme']='arbitrary-theme';self.assertTrue(validator.validate_project(raw))
