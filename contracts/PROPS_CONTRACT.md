# Props Contract (Zenith V0)

Status: FROZEN (V0.2)

This document locks the props mental model before code changes.

## Scope

Props are structural inputs passed from page-level compile output into component factories.

## Proposed Shape

Props belong to component instance records (not global runtime lookup):

```json
{
  "component_instances": [
    {
      "instance": "c0",
      "hoist_id": "btn_abc123",
      "selector": "[data-zx-c=\"c0\"]",
      "props": [
        { "name": "start", "type": "static", "value": 5 },
        { "name": "count", "type": "signal", "index": 0 }
      ]
    }
  ]
}
```

## Locked Semantics

- Props are provided explicitly in IR/component instance tables.
- Props are serialized as ordered arrays (`[{ name, type, ... }]`) for deterministic hashing.
- Props are passed as factory arguments at mount time.
- No implicit prop reactivity or runtime prop discovery.
- Signal props are passed by signal table index reference.
- Static props are passed as immutable literals.
- Runtime never infers props from DOM attributes.
- Runtime freezes resolved props before factory injection.

## Forbidden

- Runtime prop name resolution.
- Proxy-based magic or hidden observers for props.
- Implicit conversion of plain props into signals.
- CLI-side prop transformation logic.
- Dynamic prop keys, spread props, or duplicate prop names.

## Boundary Ownership

- Compiler: resolves and serializes props into instance payload.
- Bundler: emits props unchanged into bootstrap payload.
- Runtime: passes props through to component factory without reinterpretation.
