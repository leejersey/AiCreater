# Semantic Beats and Object Identity

Approved continuation: offline fixes only; no provider calls or execution of new generated source.

- Keep measured captions, audio, narration and historical artifacts immutable.
- Split future design cues at measured sentence endings and before explicit step markers. Retain the existing 60-character fallback for long unpunctuated speech and the 30-cue bound; never invent timestamps or split a measured caption.
- Reuse existing object IDs and beat changes for empty/filled/assembled states. Transport groups belong in implementation, not duplicate drawable object records. This is a generation rule, not an automatic identity proof.
- Test measured pauses, step boundaries, punctuation-free fallback, source preservation and prompt contracts; replay the existing RAG captions read-only.
- Verify scoped Python/Node tests and TypeScript. No claim of improved model output or rendered quality without a separately authorized run.
