import json
import unittest
from services.visual.quality import quality_feedback

class QualityFeedbackTests(unittest.TestCase):
    def test_repeated_geometry_findings_are_deduplicated_without_hiding_missing_coverage(self):
        issue={'kind':'label-route','target':'text[11]','detail':'Intersects route rail-main'}
        preview={'id':'preview','input':{'sha256':'a'*64},'result':{'sha256':'a'*64,'geometry':{'status':'failed','issueCount':39,'motionChecks':0,'coverageGaps':[{'kind':'missing-motion-coverage','detail':'No measured movers'}],'frames':{'1':{'issues':[issue]},'2':{'issues':[issue]}}}}}
        text=quality_feedback(preview)
        self.assertIn('39',text);self.assertIn('missing-motion-coverage',text)
        self.assertEqual(text.count('Intersects route rail-main'),1)
        self.assertIn('不得删除',text);self.assertLessEqual(len(text),8000)

    def test_feedback_requires_failed_report_bound_to_source_and_is_bounded(self):
        base={'id':'p','input':{'sha256':'a'*64},'result':{'sha256':'b'*64,'geometry':{'status':'failed'}}}
        with self.assertRaises(ValueError):quality_feedback(base)
        base['result']['sha256']='a'*64;base['result']['geometry']['status']='passed'
        with self.assertRaises(ValueError):quality_feedback(base)
