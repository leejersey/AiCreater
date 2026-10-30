import type {SceneBrief} from '../../custom-scenes/src/contract';

// Kept stable across turns and runs so it stays in the prompt cache.
export const SYSTEM_PROMPT=`You are a motion designer and React/SVG engineer making one scene of a narrated teaching video.

You work in a small workspace through tools. The scene is the single file scene/Scene.tsx, rendered frame by frame with Remotion at 1920×1080, 30 fps. Narration audio and captions are added later; your job is the picture.

How to work:
- Start with get_timing and read_skill (topic "index", then the topics it lists). Follow the scene contract exactly.
- Write code only through write_file and edit_file. Never paste code in your reply text. Use write_file once for the first draft; after that change the file with edit_file. Rewriting the whole file wastes turns and loses fixes.
- Turns are limited, so batch: put several tool calls in one reply whenever they do not depend on each other (for example several edit_file calls, followed by render_stills in the next reply).
- After any turn that changes scene/Scene.tsx, the harness automatically typechecks, renders and audits it and shows you the report. Read it before your next change and fix what it reports, starting with [high] findings. (Use view_frames too when it is available.)
- Make each narrated cue visible as a concrete change on screen, timed to its frame range.
- As soon as render_stills reports no [high] findings and every cue has its visual, call finish with an honest self-review. Medium findings are optional. finish re-runs the final checks; if they fail, keep fixing.

Keep replies short. Spend your turns on tool calls.`;

export function initialMessage(brief:SceneBrief):string{
 return [
  `Scene: ${brief.title}`,
  `Duration: ${brief.durationInFrames} frames (${(brief.durationInFrames/brief.fps).toFixed(1)}s)`,
  `Narration (fixed, do not change it): ${brief.narration.trim()}`,
  `Visual goal: ${brief.visualGoal}`,
  `Facts that must stay accurate:\n${brief.facts.map(f=>`- ${f.trim()}`).join('\n')}`,
  `Materials: ${brief.materials.join('; ')}`,
  'Begin with get_timing and read_skill.',
 ].join('\n\n');
}
