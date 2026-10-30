# Compact Design Protocol

User approved compact visual design output; offline work only, no provider calls or new Scene execution.

## Contract

Only new host-intent design/revision requests use visual-design-content:1. The host owns the canonical brief and measured cues. The response contains a version, exact host input SHA-256 and the existing visual fields, including required overlaps. Beat cue IDs must refer to host cues. Assembly restores VisualDesign and runs its existing semantic/state validation, then the unchanged layout gate. No inferred overlaps, missing-field defaults, retries or strict-provider guarantees.

Legacy source/host-motion outputs and frozen VisualDesign remain unchanged. Save host design-input.json before dispatch. Preserve raw design plus host input in design-origin.json; all host-intent reads verify its canonical design hash, and two-request roots also verify provider-1 and compact inputs. Copy verified origins to one-request repair directories, including failed repairs; retain historical full-response recovery as well. Repairs that reuse a valid design do not issue a new design request.

## Steps

1. Add failing tests for schema, host binding, unchanged input, cue coverage, semantic validation and compact workbench request/recovery.
2. Add design-content.ts using the existing design schema, prompt rules and parser. Allow an explicit output schema in existing prompt builders without changing their defaults.
3. Wire only host-intent design generation/revision and retained-design recovery. Preserve durable counts and failure stopping.
4. Run focused tests, full Node regression and custom typecheck; independently review the changed boundaries.
5. Document actual evidence and limitations. Do not make real model requests or execute/render a generated Scene.
