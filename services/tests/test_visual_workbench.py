import copy
import unittest

from services.projects.store import StoreError
from services.visual.contract import partition_narration, measured_input, fingerprint, require_budget


class VisualContractTests(unittest.TestCase):
    def test_partition_keeps_every_character_and_bounds(self):
        text=('第一段解释循环。\n\n第二段保留空格和标点！'*70)
        pieces=partition_narration(text)
        self.assertEqual(''.join(pieces),text)
        self.assertTrue(all(0<len(p)<=800 for p in pieces))
        self.assertLessEqual(len(pieces),20)

    def test_partition_accepts_multiple_chapters_above_single_scene_limit(self):
        text='知识讲解。'*960
        pieces=partition_narration(text)
        self.assertEqual(''.join(pieces),text)
        self.assertTrue(all(len(p)<=800 for p in pieces))
        with self.assertRaises(StoreError):partition_narration('文'*16001)

    def scene(self):
        return {'id':'scene-demo','revision':1,'state':'ready','scene':{
            'narration':{'text':'读代码。\n再修改。','audio_asset_id':'voice','audio_start_frame':6},
            'duration_frames':150,'captions':[{'text':'读代码。','start_frame':6,'end_frame':50},
              {'text':'再修改。','start_frame':55,'end_frame':144}]}}

    def asset(self):
        return {'id':'voice','checksum':'a'*64,'storage_key':'generated/a.wav','duration_ms':4600}

    def test_measured_cues_preserve_source_not_display_line_breaks(self):
        row=self.scene();project={'title':'解释循环','config':{'assets':[self.asset()]}}
        result=measured_input(project,row)
        self.assertEqual(''.join(c['text'] for c in result['cues']),row['scene']['narration']['text'])
        self.assertEqual(result['cues'][0]['startFrame'],6)
        self.assertEqual(result['cues'][-1]['endFrame'],144)
        self.assertEqual(result['brief']['durationInFrames'],150)

    def timed(self, captions, text=None):
        row=self.scene()
        row['scene']['captions']=captions
        row['scene']['narration']['text']=text if text is not None else ''.join(c['text'] for c in captions)
        row['scene']['duration_frames']=captions[-1]['end_frame']+6
        return measured_input({'title':'流程','config':{'assets':[self.asset()]}},row)

    def test_sentence_and_step_boundaries_use_only_measured_caption_edges(self):
        captions=[{'text':'整体流程。','start_frame':6,'end_frame':30},
                  {'text':'首先，检索','start_frame':40,'end_frame':65},
                  {'text':'相关片段','start_frame':65,'end_frame':95},
                  {'text':'然后，增强提示。','start_frame':110,'end_frame':145},
                  {'text':'最后，生成答案。','start_frame':160,'end_frame':200}]
        text='整体流程。\n首先，检索相关片段 然后，增强提示。最后，生成答案。\n'
        result=self.timed(captions,text)
        self.assertEqual([(c['startFrame'],c['endFrame']) for c in result['cues']],[(6,30),(40,95),(110,145),(160,200)])
        self.assertEqual(''.join(c['text'] for c in result['cues']),text)
        self.assertEqual(result['scene']['captions'],captions)

    def test_no_new_boundary_is_invented_inside_one_measured_caption(self):
        captions=[{'text':'检索。然后，增强。','start_frame':6,'end_frame':60}]
        self.assertEqual(len(self.timed(captions)['cues']),1)

    def test_unpunctuated_speech_retains_bounded_fallback_and_measured_gaps(self):
        captions=[{'text':'字'*30,'start_frame':6,'end_frame':40},
                  {'text':'字'*30,'start_frame':50,'end_frame':90},
                  {'text':'结尾','start_frame':100,'end_frame':120}]
        self.assertEqual([(c['startFrame'],c['endFrame']) for c in self.timed(captions)['cues']],[(6,90),(100,120)])

    def test_semantic_splits_cannot_silently_exceed_cue_budget(self):
        captions=[{'text':'一句。','start_frame':6+i*10,'end_frame':15+i*10} for i in range(31)]
        with self.assertRaises(StoreError):self.timed(captions)

    def test_bad_or_missing_timing_never_uses_estimates(self):
        project={'title':'解释','config':{'assets':[self.asset()]}}
        for patch in [{'state':'needs_voice'},{'state':'ready','scene':{**self.scene()['scene'],'captions':[]}},
                      {'state':'ready','scene':{**self.scene()['scene'],'captions':[{'text':'编造','start_frame':6,'end_frame':144}]}}]:
            with self.assertRaises(StoreError):measured_input(project,{**self.scene(),**patch})

    def test_fingerprint_changes_for_media_timing_and_revision(self):
        row=self.scene();asset=self.asset();base=fingerprint(row,asset)
        for changed in [{**row,'revision':2},{**row,'scene':{**row['scene'],'duration_frames':151}}]:
            self.assertNotEqual(base,fingerprint(changed,asset))
        edited=copy.deepcopy(row);edited['scene']['captions'][0]['end_frame']=49
        self.assertNotEqual(base,fingerprint(edited,asset))
        self.assertNotEqual(base,fingerprint(row,{**asset,'checksum':'b'*64}))

    def test_budget_is_explicit_exact_and_not_boolean(self):
        require_budget(True,2,2)
        for confirmed,maximum in [(False,2),(True,1),(True,True),(True,3)]:
            with self.assertRaises(StoreError):require_budget(confirmed,maximum,2)


if __name__=='__main__':unittest.main()
