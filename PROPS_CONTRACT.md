# Props Contract (Zenith V0 Planning Freeze)

Canonical public docs: `../zenith-docs/documentation/contracts/props-contract.md`


Status: DRAFT-FROZEN (NO IMPLEMENTATION IN V0)

This document locks the props mental model before code changes.

## Scope

Props are structural inputs passed from page-level compile output into component factories.

V0 does not implement full props yet. This document defines boundaries for the next phase.

## Proposed Shape

Props belong to component instance records (not global runtime lookup):

```json
{
  "component_instances": [
    {
      "instance": "c0",
      "hoist_id": "btn_abc123",
      "selector": "[data-zx-c=\"c0\"]",
      "props": { "start": 5, "label": "Save" }
    }
  ]
}
```

## Locked Semantics

- Props are provided explicitly in IR/component instance tables.
- Props are passed as factory arguments at mount time.
- No implicit prop reactivity.
- Props become reactive only when explicitly wrapped by `signal(...)`/`state(...)`.
- Runtime never infers props from DOM attributes.

## Forbidden

- Runtime prop name resolution.
- Proxy-based magic or hidden observers for props.
- Implicit conversion of plain props into signals.
- CLI-side prop transformation logic.

## Boundary Ownership

- Compiler: resolves and serializes props into instance payload.
- Bundler: emits props unchanged into bootstrap payload.
- Runtime: passes props through to component factory without reinterpretation.
