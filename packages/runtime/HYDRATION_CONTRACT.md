# Zenith Runtime V0 Hydration Contract

Canonical public docs: `../../docs/documentation/contracts/hydration-contract.md`


Status: FROZEN (V0)

This contract locks hydration and reactivity boundaries for Zenith V0.

## 1. No Runtime Discovery

Runtime must not discover bindings by scanning unknown DOM structure.

Allowed:
- Resolve selectors from bundler-provided marker/event tables.

Forbidden:
- Global `querySelectorAll('*')` discovery passes.
- Runtime inference of binding intent from HTML shape.

## 2. Reactivity Model

Runtime primitives are explicit:
- `signal(initial)`
- `state(initialObject)`
- `zeneffect(dependencies, fn, options?)` or `zeneffect(fn, options?)`

`zeneffect` (and the `effect` alias) supports two modes:
- Explicit dependency mode: `zeneffect([dep1, dep2], (ctx) => { ... }, options?)`.
- Auto-tracked mode: `zeneffect((ctx) => { dep.get(); ... }, options?)`.

`zenEffect(callback, options?)` is auto-tracked only; its first argument must
be a callback function. It does not accept a dependency array.

Auto-tracked effects capture signal reads made during the effect body. The
runtime effect scheduler supports `flush: 'sync' | 'post'` and at most one of
`debounceMs`, `throttleMs`, or `raf`. Default effects are scheduled on the
microtask queue (`flush: 'post'`).

## 3. Deterministic Ordering

Compiler expression ordering is canonical.
Bundler and runtime must preserve index semantics exactly.

Required:
- Marker indices are sequential `0..N-1`.
- Marker count equals expression table length.
- Runtime never remaps indices.

## 4. Explicit Bootstrap

Hydration is explicit and called by bundler/bootstrap only:

```js
hydrate({
  ir_version: 1,
  root: document,
  expressions: [],
  markers: [],
  events: [],
  refs: [],
  state_values: [],
  signals: [],
  components: []
});
```

The actual tables are assembled by the bundler/bootstrap from compiler-lowered
descriptors, bundler-generated selectors, and runtime-owned values. Runtime must
export functions only. Runtime must not auto-run.

## 5. Component Factory Payload

Component scripts are compile-time hoisted and emitted as factory modules.
Runtime receives only explicit component references in `payload.components`.

Required:
- Component host selectors are provided by bundler.
- Runtime instantiates factories only from payload.
- Runtime merges returned `bindings` into hydration state by instance key.

Forbidden:
- Runtime component discovery by scanning unknown DOM shape.
- Runtime-generated component wrappers or lifecycle registries.

## 6. Hard Fail Semantics

Runtime must throw for contract drift:
- Missing or unsupported `ir_version`.
- Duplicate marker indices.
- Missing index in sequence.
- Out-of-order expression table entries.
- Out-of-order marker table entries.
- Marker index out of bounds.
- Marker/expression count mismatch.
- Event index out of bounds.

No fallback behavior is allowed for broken payload contracts.

## 7. Determinism and Purity

Forbidden in runtime/bundler output:
- `eval(`
- `new Function(`
- `require(`
- `Date(`
- `Math.random(`
- `crypto.randomUUID(`
- `process.env`

Compile-time guarantees override runtime flexibility.

## 8. Freeze Boundary Contract

Runtime payload freezing is allowed only for deterministic internal tables and
plain JSON-like containers controlled by runtime (`Object` / `Array`).

Runtime MUST NOT freeze:
- `ref()` objects (objects with writable `.current`)
- function values (handlers/callbacks)
- host/platform objects (`Node`, `EventTarget`, `URL`, `Request`, `Response`, etc.)

Rationale:
- hydration and `zenMount` must be able to assign `ref.current` without throwing
- host objects preserve platform mutability semantics
