import unittest
from services.projects.jobs import Jobs


class StoryboardJobErrorTests(unittest.TestCase):
    def test_long_label_error_identifies_scene_and_element_without_returning_text(self):
        job={'stage':'storyboard','scene_id':None,'attempts':1}
        error=Jobs._error(job,'storyboard_schema_error',[
            {'path':'/scenes/8/elements/1/content','rule':'maxLength','message':'private-provider-text'}])
        self.assertEqual(error['message'],'第9个场景、第2个元素的画面文字超过40字，请使用短标签；完整口播无需删减。')
        self.assertNotIn('private-provider-text',str(error))
        self.assertFalse(error['retryable'])

    def test_unrelated_schema_failures_keep_generic_error(self):
        job={'stage':'storyboard','scene_id':None,'attempts':1}
        error=Jobs._error(job,'storyboard_schema_error',[{'path':'/scenes/0/type','rule':'enum'}])
        self.assertEqual(error['message'],'Storyboard validation: fields do not match the teaching schema')
