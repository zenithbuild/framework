# IR Envelope Contract (Zenith V0)

Status: FROZEN

This contract defines the compiler-to-bundler IR envelope for V0 process seams.

## Canonical Shape

```json
{
  "ir_version": 1,
  "html": "<main>...</main>",
  "expressions": [],
  "signals": [],
  "expression_bindings": [],
  "marker_bindings": [],
  "event_bindings": [],
  "components_scripts": {},
  "component_instances": [],
  "hoisted": {
    "imports": [],
    "declarations": [],
    "functions": [],
    "signals": [],
    "state": [],
    "code": []
  }
}
```

## Version Gate

- `ir_version` is mandatory.
- Runtime and bundler must hard-fail when `ir_version !== 1`.
- No compatibility fallback in V0.

## Ownership

- Compiler emits this envelope deterministically.
- CLI forwards the envelope unchanged.
- Bundler consumes it unchanged for semantic tables.
- Runtime executes bootstrap payload derived from it.

## Drift Policy

Any future shape change requires:
1. Incremented `ir_version`.
2. Updated contract docs.
3. Updated bundler/runtime validators.
4. Added integration guard tests before merge.
