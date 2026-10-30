# Object Motion Data

User approved offline implementation only. No provider/TTS calls, generated Scene execution or render.

New host-intent data requests use object-motion-data:1: design SHA binding, anchors, one objects array (id/initialAnchor/actions/artwork), and audit. The host supplies brief/duration and separates objects into the existing intent and layers. Reuse current schemas for actions, anchors, artwork and audit; keep all current semantic/compiler/assembly/geometry gates. No inferred actions, silent fixes or old-output fallback in new generation.

Keep frozen-intent.json and intent_sha256 as the raw validated data envelope and its hash. Read/recovery supports the new version and historical motion-intent-assembly:1; both compile to motion-assembly:2. Source/host-motion, request caps, design provenance, source approval and API publication remain unchanged.

Steps: (1) red tests for flat schema, host binding, object identity and semantic rejection; (2) implement adapter and shared intent rules; (3) wire new generation and version-aware frozen reads/hashes, retain old fixtures; (4) focused/full tests, typecheck, independent review; (5) document evidence and limitations. Do not modify the failed real response or infer a valid payload from it.
