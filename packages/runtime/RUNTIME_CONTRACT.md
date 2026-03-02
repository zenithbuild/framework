# RUNTIME_CONTRACT.md — Sealed Runtime Interface

Canonical public docs: `../zenith-docs/documentation/contracts/runtime-contract.md`


> **This document is a legal boundary.**
> The runtime is a consumer of bundler output.
> It does not reinterpret, normalize, or extend.

## Status: FROZEN (V0)

---

## 1. Input Surface

The runtime receives exactly one module per page:

| Export | Type | Contract |
|---|---|---|
| `__zenith_html` | `string` | Template literal, immutable |
| `__zenith_expr` | `(() => any)[]` | Pre-bound expression functions, immutable, ordered |
| `__zenith_page()` | `function` | Returns `{ html, expressions }` |

### Expression Functions

Each entry in `__zenith_expr` is a **pre-bound zero-argument function** emitted by the bundler. The runtime never resolves expression strings, never performs key lookups, and never interprets JavaScript.

```js
// Bundler emits:
export const __zenith_expr = [
  () => count(),
  () => count() + 1,
  () => increment()
];

export default function __zenith_page() {
  return {
    html: __zenith_html,
    expressions: __zenith_expr
  };
}
```

The runtime simply executes: `expressions[index]()`.

---

## 2. Runtime Responsibilities (Allowed)

| Action | Method |
|---|---|
| Insert HTML into container | `container.innerHTML = html` |
| Locate expression bindings | `querySelectorAll('[data-zx-e]')` |
| Locate event bindings | `querySelectorAll('[data-zx-on-*]')` |
| Bind expressions to DOM | `effect(() => node.textContent = expressions[index]())` |
| Bind event listeners | `node.addEventListener(event, expressions[index])` |
| Update DOM on signal change | Via effect re-execution |
| Clean up on unmount | Remove effects + listeners |

---

## 3. Runtime Prohibitions (Forbidden)

The runtime **must never**:

- Parse JavaScript expressions
- Resolve expression strings against a scope object
- Normalize expression strings
- Modify expression content
- Introduce component abstractions
- Perform virtual DOM diffing
- Re-render full subtrees
- Implement lifecycle hooks beyond mount/unmount
- Access or mutate `window` globals
- Reorder binding indices
- Interpret import semantics
- Add framework-level abstractions (routing, stores, context)

---

## 4. Data Attribute Contract

Inherited from `BUNDLER_CONTRACT.md`:

| Attribute | Format | Runtime Action |
|---|---|---|
| `data-zx-e` | `"<index>"` or `"<i0> <i1> ..."` | Execute `expressions[index]()`, bind result to node |
| `data-zx-on-<event>` | `"<index>"` | Call `addEventListener(event, expressions[index])` |

Index values are 0-based integers matching `__zenith_expr` array positions.

---

## 5. Reactivity Model

### Signal Primitive

```js
const count = signal(0);  // Create
count();                   // Read (tracks dependency)
count.set(1);              // Write (notifies subscribers)
```

Internals:
- Each signal maintains a `Set<Effect>` of subscribers
- Reading a signal during effect execution registers the effect as a subscriber
- Writing a signal notifies all subscribers synchronously

### Effect Primitive

```js
effect(() => {
  node.textContent = count();
});
```

Internals:
- On execution, sets itself as the "current tracking context"
- Any signal read during execution adds this effect to its subscriber set
- When a dependency signal changes, the effect re-runs

### Constraints

- No batching
- No scheduler / microtask queue
- No async effects
- No suspense / lazy loading
- No lifecycle hooks beyond `cleanup()`

---

## 6. Hydration Algorithm

Single-pass, deterministic:

1. Call `__zenith_page()` → receive `{ html, expressions }`
2. Set `container.innerHTML = html`
3. Walk DOM once: `querySelectorAll('[data-zx-e], [data-zx-on-click], ...')`
4. For each node with `data-zx-e`:
   - Parse space-separated indices
   - For each index: create `effect(() => node.textContent = expressions[index]())`
5. For each node with `data-zx-on-*`:
   - Extract event name from attribute suffix
   - `node.addEventListener(eventName, expressions[index])`
6. Store all effects and listeners in a cleanup registry

No recursive diffing. No re-render cycle. No component tree.

---

## 7. Cleanup Contract

The runtime exposes `cleanup()`:

- Disposes all active effects (clears subscriber sets)
- Removes all event listeners
- Clears the binding registry
- Leaves the DOM intact (caller decides whether to clear container)

Cleanup is deterministic — calling it twice is a no-op.

---

## 8. Public API Surface

Total exports (exhaustive):

```js
export { signal }    // Create reactive signal
export { effect }    // Create reactive effect
export { mount }     // Mount page module into container
export { cleanup }   // Tear down all bindings
```

Four functions. No more.

---

## 9. Alignment Verification

This contract is valid if and only if:

- [ ] `data-zx-e` indices match `__zenith_expr` array positions (from `BUNDLER_CONTRACT.md` §2)
- [ ] Expression functions are pre-bound at bundle time — runtime never resolves strings
- [ ] HMR footer is ignored by runtime (from `BUNDLER_CONTRACT.md` §7)
- [ ] No symbol beyond `__zenith_html`, `__zenith_expr`, `__zenith_page` is consumed (from `BUNDLER_CONTRACT.md` §1)
