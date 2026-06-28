# RUNTIME_CONTRACT.md — Sealed Runtime Interface

Canonical public docs: `../../docs/documentation/contracts/runtime-contract.md`


> **This document is a legal boundary.**
> The runtime is a consumer of bundler output.
> It does not reinterpret, normalize, or extend.

## Status: FROZEN (V0)

---

## 1. Input Surface

The hydration/bootstrap entrypoint is:

| Export | Type | Contract |
|---|---|---|
| `hydrate(payload)` | `function` | Called by the bundler bootstrap with an explicit, fully-constructed payload. |

The runtime package also exports public primitives such as `signal`, `state`, `zeneffect`, `zenEffect`, `effect`, `zenMount`, `zenOn`, `zenResize`, and `collectRefs` as listed later in this contract. Those public primitives remain part of the runtime package surface; `hydrate(payload)` is only the hydration/bootstrap entrypoint.

The runtime **must not** auto-discover or auto-run page modules. It only executes when `hydrate(payload)` is invoked.

### Payload

`payload` is a plain object provided by the bundler/bootstrap. Compiler output is consumed and assembled by the bundler/bootstrap into the explicit `hydrate(payload)` tables. Required and commonly used fields:

| Field | Type | Contract |
|---|---|---|
| `ir_version` | `number` | Must be `1`. Missing or unsupported versions hard-fail. |
| `root` | `Element | Document` | Scope for all selector resolution. |
| `expressions` | `object[]` | Compiler-lowered expression descriptors, ordered by `marker_index`. |
| `markers` | `object[]` | Marker descriptors with `index`, `kind`, `selector`, and kind-specific data. |
| `events` | `object[]` | Event binding descriptors with `index`, `event`, `selector`, and optional data. |
| `refs` | `object[]` | Ref descriptors with `index`, `state_index`, `selector`. Optional if empty. |
| `state_values` | `any[]` | Runtime-owned state/signal/ref values referenced by index. |
| `signals` | `object[]` | Signal table entries mapping `id` to `state_index`. |
| `components` | `object[]` | Component factory descriptors with `instance`, `selector`, `props`, `create`. |

Optional fields supplied by the bundler when needed:

| Field | Type | Purpose |
|---|---|---|
| `state_keys` | `string[]` | Optional human-readable keys for `state_values`. |
| `params` | `object` | Route parameters for `params.*` literal resolution. |
| `ssr_data` | `object` | Server-provided data for `ssr.*` literal resolution. |
| `props` | `object` | Forwarded props for `props.*` literal resolution. |
| `expr_fns` | `function[]` | Compiled expression functions indexed by `fn_index`. |

### Expression Descriptors

Entries in `payload.expressions` are **compiler-lowered descriptors**, not raw JavaScript. The runtime resolves each descriptor against the payload tables and state values:

- `literal` — resolved as a lowered literal value. Supported literal roots are `props`, `params`, `data`, and `ssr`. Exact `state_values` entries may be resolved through their `state_keys` identifiers.
- `state_index` — reads `state_values[state_index]`.
- `signal_index` — reads the signal mapped from the `signals` table.
- `fn_index` — calls `expr_fns[fn_index]` with the runtime context.
- `component_instance` + `component_binding` — reads the named export from a mounted component's `bindings` object.

The runtime **never** parses arbitrary JavaScript expression strings, never performs key lookups beyond the documented canonical member chains, and never reorders or remaps indices.

---

## 2. Runtime Responsibilities (Allowed)

| Action | Method |
|---|---|
| Receive explicit payload | `hydrate(payload)` |
| Validate payload contract | Internal `_validatePayload(payload)` |
| Deep-freeze payload tables | `Object.freeze` on JSON-like tables/descriptors (ref/function/host values excluded) |
| Resolve nodes from provided selectors | `root.querySelectorAll(selector)` or `comment:` lookup |
| Hydrate payload ref bindings | Assign matched node to `state_values[state_index].current` |
| Mount component factories | Call `component.create(host, props, runtimeApi)`, then `instance.mount()` |
| Bind text/attribute markers | Evaluate expression and apply to matched node(s) |
| Bind event listeners | Evaluate handler and call `addEventListener` on matched event node(s) |
| Re-render markers on signal change | Subscribe signal and re-run `_renderMarker(index)` |
| Clean up on unmount | Dispose effects, listeners, refs, and component scopes |

All selectors must come from the bundler-provided `markers`, `events`, `refs`, and `components` tables. The runtime resolves each selector exactly as given.

---

## 3. Runtime Prohibitions (Forbidden)

The runtime **must never**:

- Parse JavaScript expressions from strings
- Resolve expression strings against a scope object outside the documented canonical chains
- Normalize expression strings
- Modify expression content
- Introduce component abstractions not present in `payload.components`
- Perform virtual DOM diffing
- Re-render full subtrees
- Implement lifecycle hooks beyond explicit mount/unmount/cleanup
- Access or mutate `window` globals directly (use `zenWindow()` / `zenDocument()`)
- Reorder binding indices
- Interpret import semantics
- Infer bindings from arbitrary DOM shape
- Walk the DOM with `querySelectorAll('*')` or any other full-tree discovery pass
- Add framework-level abstractions (routing, stores, context)

---

## 4. Data Attribute Contract

Runtime consumes selector tables assembled by the bundler/bootstrap. The bundler contract still owns emitted markup details and should be aligned in a separate bundler contract truth batch. This runtime contract defines only what the runtime consumes from the hydration payload.

| Attribute | Format | Runtime Action |
|---|---|---|
| `data-zx-e` | `"<index>"` or `"<i0> <i1> ..."` | Resolve selector from marker table and bind expression result to matched node(s) |
| `data-zx-on-<event>` | `"<index>"` | Resolve selector from event table and attach `addEventListener(event, handler)` |
| `data-zx-ref` | `"<index>"` | Resolve selector from ref table and assign matched node to `ref.current` |
| `data-zx-c` | `"<instance>"` | Resolve selector from component table for component host nodes |

Index values are 0-based integers matching `payload.expressions` positions. The runtime only sees these markers as selectors in payload tables; it must not scan for them independently.

---

## 5. Reactivity Model

### Signal Primitive

```js
const count = signal(0); // Create
count.get();             // Read (tracks dependency)
count.set(1);            // Write (notifies subscribers)
```

Internals:
- Each signal maintains a `Set<callback>` of subscribers
- Reading a signal during effect execution registers the effect as a subscriber
- Writing a signal notifies all subscribers synchronously

### State Primitive

```js
const store = state({ count: 0 });
store.get();
store.set({ count: 1 });
```

- Returns immutable snapshots
- Accepts patch objects or functional updaters

### Effect Primitive

```js
zeneffect(() => {
    node.textContent = count.get();
});
```

```js
zeneffect([count], () => {
    node.textContent = count.get();
});
```

- Auto-tracked or explicit-dependency modes
- Auto-tracked mode options support `flush: 'sync' | 'post'`, plus at most one of `debounceMs`, `throttleMs`, or `raf`
- Auto-tracked dependency changes are scheduled and re-run; explicit-dependency changes re-run synchronously once the scope is ready

### Scheduling & Execution Constraints

- By default, effects are scheduled on the microtask queue (`flush: 'post'`) to prevent render thrashing
- Synchronous execution is supported via `flush: 'sync'`
- No suspense / lazy loading
- `zenMount()` exists as the sole component bootstrap hook, deferring initialization until the DOM attachment scope is complete
- Beyond `zenMount()` and cleanup, the runtime offers no lifecycle hooks

---

## 6. Hydration Algorithm

Single-pass, deterministic:

1. Call `hydrate(payload)`.
2. Validate the payload: `ir_version`, table ordering, marker/expression count, event/marker indices, and selector presence. Hard-fail on drift.
3. Deep-freeze payload tables and nested descriptors. Ref-like objects, functions, and host objects must remain writable.
4. Build the signal map from `payload.signals` + `payload.state_values`.
5. Hydrate refs: for each ref descriptor, resolve its selector and assign the first matched node to `state_values[state_index].current`. Register cleanup to clear refs.
6. Mount components: resolve host selectors, instantiate factories with frozen props and a scoped runtime API, call `mount()`, and register cleanup.
7. Hydrate markers: for each marker, resolve its selector, evaluate the matching expression, and apply the value. Event markers are skipped here.
8. Subscribe marker dependencies: subscribe referenced signals/state values and re-render the affected marker index on change.
9. Bind event markers: resolve event selectors, evaluate handlers, and call `addEventListener` for each matched node. `esc` events are document-dispatched.
10. Return the cleanup disposer.

No recursive diffing. No full-tree discovery. No re-render cycle outside marker-level updates.

---

## 7. Cleanup Contract

`hydrate(payload)` returns a cleanup function:

- Disposes all active effects and component side-effect scopes
- Removes all event listeners
- Clears ref `.current` values
- Clears binding subscriptions
- Leaves the DOM intact (caller decides whether to clear the container)

Cleanup is deterministic — calling it twice is a no-op.

The runtime also keeps an internal `cleanup()` primitive at the
`dist/cleanup.js` module path for internal modules and tests. It is not a
public package export; `@zenithbuild/runtime` only exports `.` and `./template`
as declared in its package manifest.

---

## 8. Public API Surface

Canonical named exports from `packages/runtime/dist/index.js`:

```js
export { signal }        // Explicit get/set signal primitive
export { state }         // Immutable state primitive
export { zeneffect }     // Canonical reactive effect subscription (auto or explicit deps)
export { zenEffect }     // Alias/variant of zeneffect with explicit options
export { zenMount }      // Canonical component bootstrap lifecycle hook
export { zenPresence }   // Phase-based presence for ref-owned always-mounted nodes
export { zenWindow }     // Canonical SSR-safe global window access
export { zenDocument }   // Canonical SSR-safe global document access
export { zenOn }         // Canonical SSR-safe event subscription
export { zenResize }     // Canonical window-resize subscription
export { collectRefs }   // Deterministic multi-ref collection helper
export { hydrate }       // Mount payload into a root
```

### Optional Secondary Aliases
For developer convenience, the runtime also exports optional, standard-named aliases. These exist purely as synonyms mapped to the canonical primitives:
```js
export { effect }      // Alias for zeneffect
export { mount }       // Alias for zenMount
export { presence }    // Alias for zenPresence
export { window }      // Alias for zenWindow
export { document }    // Alias for zenDocument
```

`zenPresence` is the canonical presence helper name. `presence` is an optional convenience alias only.

`zenPresence` is intentionally not a compiler-owned implicit global. It is a narrow runtime import used with `zenMount(...)` + `zeneffect(...)` for always-mounted nodes only.

Its options may include narrow node-local coordination such as `onPhaseChange`, but it does not widen into fragment retention, focus trapping, or a generalized accessibility framework.

---

## 9. Alignment Verification

This contract is valid if and only if:

- [ ] `payload.ir_version` is present and supported
- [ ] `payload.expressions` and `payload.markers` counts align
- [ ] Marker/event/ref/component selectors are provided by the bundler/bootstrap
- [ ] The runtime resolves only selectors from the provided payload tables
- [ ] Expression descriptors are lowered by the compiler — runtime never resolves raw JavaScript
- [ ] No full-tree DOM discovery (e.g., `querySelectorAll('*')`) is performed
- [ ] Payload tables are frozen, while ref-like, function, and host values remain writable
- [ ] HMR footer is ignored by runtime (from `BUNDLER_CONTRACT.md` §7)
- [ ] Runtime source contains no forbidden execution primitives (`eval(`, `new Function`, `Function(`, `process.env`)
