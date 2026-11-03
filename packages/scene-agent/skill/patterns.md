# Teaching patterns

Pick the pattern that matches what each cue says. A scene usually mixes two or three. These are shapes of explanation, not styles: choose your own layout and colours.

## Problem → cause

The narration names something going wrong and why.

- Show the failing thing concretely: a question, the model's answer, and that answer being marked wrong (struck through, flagged).
- Show the cause as a state of an object, not a caption: a lock on the model's knowledge, a calendar that stops, a library that is out of reach.
- Keep the failing example generic unless the brief gives specifics.

## Mechanism / pipeline

The narration walks through steps (retrieve → augment → generate, query → vector → nearest neighbour).

- Draw every station once and keep it on screen; light up the current step per cue instead of replacing the picture.
- Move one thing through the stations (a document, a query token, a vector) so the viewer follows a single object.
- A persistent header or rail that shows all steps, with the current one highlighted, tells the viewer where they are.

## Comparison

Two approaches, before/after, with/without.

- Put the two side by side with the same structure, so differences are visible at a glance (left: keyword hits in documents; right: points in a vector space).
- Show the difference in behaviour, not only in labels: many lines vs a few hops, a wrong answer vs an answer with evidence.

## Enumeration (advantages, challenges, features)

The narration lists items. This is where scenes most often end up empty or padded.

- Show exactly the items the narration names, each with its own words from the brief. Count them in the narration first.
- Reveal each item when it is spoken. Items already shown stay visible, so the list builds up.
- Lay the items out to fill the space the list owns: three challenges get three columns across the width, not two and a gap.
- Draw each item as an object in a state, with its name as a label underneath: a document crossed out, a box overflowing, gauges that disagree, a lock that closes. `read_skill examples` shows how. An icon in a titled card is the fallback for items that are pure names with nothing to show.
- Add a one-line consequence from the narration under the name ("召回不相关文档 → 生成错误答案"). Do not invent consequences the narration does not state.
- Never leave placeholder shapes: no empty cards, no dashed boxes waiting for text, no lorem lines standing in for items. If there is nothing to put in a box, do not draw the box.

## Summary / outlook

The narration recaps and looks ahead ("总结一下…", "随着…发展…", "谢谢观看").

- Recap by reusing the picture the viewer already knows: the same pipeline from earlier chapters, compact, with its steps named.
- Outlook statements without data stay qualitative: an arrow forward, a road extending, the pipeline growing a new branch. Do not draw bar charts, axes or growth curves unless the brief gives the numbers; a chart implies measurements.
- Closing lines ("谢谢观看") get a clean end card: title, one line, nothing else.

## Before calling finish

- Count the items the narration lists and the items on screen; they must match.
- Look for any shape without content (empty card, dashed box, grey bars standing in for text you never wrote) and remove it or fill it with words from the brief.
- Check that no chart, axis or number suggests data the brief does not contain.
