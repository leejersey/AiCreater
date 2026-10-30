# Independent Strict Object Tool Experiment

Approved scope: offline only. Do not change workbench/provider defaults, call any model/TTS, execute a Scene or render.

## Design

Add one pure experimental module. It builds a Beta Chat Completions request with one forced strict function tool but has no HTTP client, key, headers or filesystem access. A versioned wire schema uses required properties, explicit world/object coordinate-frame branches, and SVG attribute entry lists instead of optional fields. Use standard recursive $defs/$ref; server acceptance of this spelling/subset remains unverified (the official example uses $def).

Response parsing requires exactly one completed named function call, bounded JSON arguments and matching frozen design SHA. Decode to object-motion-data:1, reject duplicate attributes rather than overwrite them, then run existing full parseObjectMotionData. Preserve the exact argument-text hash separately. Never assemble source or execute a tool/function by its returned name.

Transport bounds omitted from the strict wire grammar remain enforced locally. Bound bytes and nesting before recursive validation/decoding. Strict structure never replaces identity, coordinate/cycle, drawing, audit or geometry checks. No automatic retry/fallback or old payload coercion.

## Steps

1. Red tests: strict schema/request shape, all fields required, valid decode, local frame semantics, duplicate/unknown attributes and invalid responses, preserved host checks and bounded inputs.
2. Implement standalone module, no callers added to production.
3. Focused tests and typecheck; independent boundary review.
4. Document actual results and unresolved provider acceptance. No real probe in this task.
