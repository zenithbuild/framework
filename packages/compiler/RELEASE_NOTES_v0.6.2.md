# @zenithbuild/compiler v0.6.2

## Summary

- CLI JSON now always includes `ref_bindings`
- JSON schema remains additive with `schemaVersion: 1` and stable `warnings`
- `zenEffect` lowering coverage now protects `.get()` and `.set(...)` rewrites in hoisted script code

## Breaking Changes

None. This is a contract-hardening patch release.

## Key Changes

- **Ref hydration contract:** `ref_bindings` is always present in compiler CLI JSON, even when empty
- **Schema stability:** `schemaVersion` remains `1`; `warnings` remains always-present and additive
- **Regression coverage:** compiler tests now lock `zenEffect` state-read and assignment lowering

## Verification Checklist

- [ ] `cargo test` passes
- [ ] CLI JSON for a ref fixture includes non-empty `ref_bindings`
- [ ] CLI JSON for a no-ref fixture includes `ref_bindings: []`
