# Compact component motion

Scope approved by continuation: remove model-authored recursive SVG from the next experiment. Keep old production modes unchanged. No network or Scene execution in this implementation step.

1. Add failing tests for a bounded host drawing catalog and compact object envelope.
2. Add host renderers for document, shelf, gripper, processor, sleeve, label and route. Dimensions come from the frozen design; no arbitrary SVG/paths/URLs or expressions accepted from model data.
3. Project the existing object-motion Schema to component-motion-data:1: objects replace artwork with component and label. Bind to design hash, preserve motion/audit fields and original full validation by deterministic compilation back to object-motion-data:1.
4. Test detailed drawings, forbidden fields/components, identity/hash binding and retained cycle/audit rejection. Keep component/label data separate from raw old failed responses; never repair those responses.
5. Run focused tests, typecheck and diff checks. Report explicitly that provider/workbench integration and visual/geometry acceptance remain pending. This is a reusable drawing compiler, not a claimed end-to-end completion.
