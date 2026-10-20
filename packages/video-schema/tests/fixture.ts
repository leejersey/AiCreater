export const validProject = () => ({
  schema_version: '1.0',
  video_config: {width: 1920, height: 1080, fps: 30, language: 'zh-CN'},
  theme: 'tech_explainer',
  assets: [{id: 'audio1', type: 'audio', storage_key: 'demo/one.wav', checksum: 'a'.repeat(64), duration_ms: 2000}],
  scenes: [{
    id: 'scene1', type: 'card_sequence',
    narration: {text: '先用规则，再用模型。', audio_asset_id: 'audio1', audio_start_frame: 6},
    duration_frames: 72,
    elements: [
      {id: 'a', content: '规则', cue: {text_start: 2, text_end: 4}},
      {id: 'b', content: '模型', cue: {text_start: 7, text_end: 9}},
    ],
    animations: [
      {target: 'a', effect: 'fade_slide', start_frame: 6, duration_frames: 12},
      {target: 'b', effect: 'fade_slide', start_frame: 36, duration_frames: 12},
    ],
    captions: [{text: '先用规则，再用模型。', start_frame: 6, end_frame: 66}],
  }],
});
export type Fixture = ReturnType<typeof validProject>;

export function codeProject() {
  const p = validProject();
  return {...p, scenes: [{...p.scenes[0], type: 'code_walkthrough',
    code: {language: 'python', source: 'total = 0\nprint(total)'},
    elements: p.scenes[0].elements.map((e, i) => ({...e, code_lines: [i + 1],
      variables: [{name: 'total', value: '0'}], output: i ? '0' : ''}))}]};
}
