# Reactive Binding Mental Model (Zenith V0)

Canonical public docs: `../zenith-docs/documentation/reference/reactive-binding-model.md`


Status: FROZEN

## What Is A Signal?

A signal is an explicit reactive primitive with stable API:
- `get()` returns current value.
- `set(next)` updates value.
- `subscribe(fn)` notifies dependents synchronously.

Signals are compiler-indexed in the IR (`signals[]`). Runtime never resolves signals by variable name.

## What Is A Marker?

A marker is a compiler-authored DOM binding slot:
- text marker (`kind: "text"`)
- attribute marker (`kind: "attr"`)
- event marker (`kind: "event"`)

Each marker has a deterministic index and selector in `marker_bindings[]`.

## What Is A Binding?

An expression binding is a table row in `expression_bindings[]` that maps marker index to one source:
- `signal_index`
- `state_index`
- component binding reference
- literal value

Bindings are positional. Runtime consumes them exactly as emitted.

## What Runtime Does

Runtime executes one explicit call:

```js
hydrate({
  ir_version: 1,
  root,
  expressions,
  markers,
  events,
  state_values,
  signals,
  components
});
```

Runtime responsibilities:
- Validate payload contract.
- Bind markers/events by index.
- Subscribe signal updates to dependent markers.
- Throw on contract drift.

## What Runtime Will Never Do

- No identifier lookup by name.
- No expression parsing/eval/new Function.
- No global DOM discovery passes.
- No table reordering/remapping.
- No implicit lifecycle/component framework behavior.

Compiler defines structure. Bundler serializes structure. Runtime executes structure.
