# BUNDLER_CONTRACT.md — Bundler Output Contract

Canonical public docs: `../../docs/documentation/contracts/bundler-contract.md`


> **This document is a legal boundary.**
> No symbol rename, no structural change, no semantic reinterpretation
> is permitted after this contract is frozen.
> This contract governs the bundler's output shape and its relationship
> to the runtime hydration contract. Runtime behavior is owned by
> `packages/runtime/RUNTIME_CONTRACT.md` and
> `packages/runtime/HYDRATION_CONTRACT.md`.

## Status: FROZEN

---

## 1. Virtual Page Scaffold Compatibility

Every bundled Zenith page module starts from a virtual entry scaffold that
remains backward-compatible with earlier tooling. The bundler still emits these
symbols and guarantees their shape and order:

| Symbol | Type | Binding | Notes |
|---|---|---|---|
| `__zenith_html` | `string` | `export const` | Template literal (backtick-delimited) |
| `__zenith_expr` | `string[]` | `export const` | Array literal, never reassigned |
| `__zenith_contract` | `string` | `export const` | Always `"v0"` |
| `__zenith_page` | `function` | `export default` | Returns `{ html, expressions, contract }` |

### Export Order (Guaranteed)

```
1. export const __zenith_html = `...`;
2. export const __zenith_expr = [...];
3. export const __zenith_contract = "v0";
4. export default function __zenith_page() { ... }
```

This order is frozen. Tests enforce `__zenith_html` appears before
`__zenith_expr`.

These symbols are the **virtual page scaffold**. They exist for compatibility
and tooling, but they are **not the runtime hydration input contract**.
The bundler/bootstrap consumes compiler output and assembles explicit
`hydrate(payload)` tables for the runtime. Marker and event tables may be
derived from the emitted markup when compiler-provided tables are absent;
refs and components are serialized directly from compiler IR payloads into
`__zenith_refs` and `__zenith_components`.

---

## 2. Hydration Bootstrap Payload

After the virtual scaffold, the bundler emits a hydration bootstrap that
imports the runtime and calls `hydrate(payload)` with fully-constructed
tables. Hydrated page modules must export `__zenith_mount(root, params)` as
the public mount function. In non-router pages the bootstrap auto-calls
`__zenith_mount(document, params)`. In router pages the runtime router uses
`__zenith_mount` for hydration. The default export / `__zenith_page()` remains
the scaffold compatibility export and is not the hydration entrypoint.

The payload passed to `hydrate(payload)` is assembled from the following page
tables emitted by the bundler/bootstrap. Marker and event tables may be derived
from emitted markup when compiler-provided tables are absent; refs and
components are serialized directly from compiler IR payloads.

| Symbol | Purpose |
|---|---|
| `__zenith_expression_bindings` | Expression descriptors ordered by `marker_index`. |
| `__zenith_markers` | Marker descriptors with `index`, `kind`, `selector`, and kind-specific data. |
| `__zenith_events` | Event binding descriptors with `index`, `event`, `selector`. |
| `__zenith_refs` | Ref descriptors with `index`, `state_index`, `selector`. |
| `__zenith_state_values` | Runtime-owned state/signal/ref values referenced by index. |
| `__zenith_state_keys` | Optional human-readable keys for `state_values`. |
| `__zenith_signals` | Signal table entries mapping `id` to `state_index`. |
| `__zenith_components` | Component factory descriptors with `instance`, `selector`, `props`, `create`. |
| `__zenith_expr_fns` (optional) | Compiled expression functions indexed by `fn_index`. |

The exact field names above are the bundler/bootstrap-facing counterparts of
the `hydrate(payload)` contract in `packages/runtime/RUNTIME_CONTRACT.md §1`.
The runtime owns interpretation of that payload.

---

## 3. Expression Array Contract

- Type: **Array literal** of string values
- Binding: **const** (never `let` or `var`)
- Order: **Left-to-right, depth-first** (compiler guarantee, passthrough)
- Content: **Exact strings from source** — no transformation, no renaming
- Index stability: Expression at index `N` may correspond to `data-zx-e="N"` in
the HTML template, but runtime binding is driven by `__zenith_markers` and
`__zenith_expression_bindings`, not by independent DOM scanning. Ref and
component attributes are not expression indices.

---

## 4. Data Attributes

| Attribute | Format | Purpose |
|---|---|---|
| `data-zx-e` | `data-zx-e="<index>"` or `data-zx-e="<i0> <i1> ..."` | Identifies an expression marker/binding position |
| `data-zx-on-*` | `data-zx-on-click="<index>"` | Identifies an event marker/expression binding position |
| `data-zx-ref` | `data-zx-ref="<index>"` | Identifies a ref-table entry, which maps to `state_index` |
| `data-zx-c` | `data-zx-c="<instance>"` or `data-zx-c="<i0> <i1> ..."` | Identifies one or more component instance keys/selectors, for example `c0` or `c0 c1` |

The `data-zx-e` and `data-zx-on-*` values are 0-based integers matching
`__zenith_expression_bindings` positions. `data-zx-ref` values identify ref-table
entries, not expression positions. `data-zx-c` values are instance keys used
by `__zenith_components` selectors. Component host selectors must support token
matching such as `[data-zx-c~="c0"]`; exact-match selectors are not sufficient
for every valid component host. The runtime resolves only selectors from the
provided payload tables and must not infer binding intent from arbitrary DOM
shape.

---

## 5. Virtual Module Namespace

| Prefix | Internal | User-resolvable |
|---|---|---|
| `\0zenith:entry:<page>` | ✅ | ❌ |
| `\0zenith:css:<page>` | ✅ | ❌ |
| `\0zenith:page-script:<page>` | ✅ | ❌ |

- All virtual IDs start with `\0` (null byte) + `zenith:`
- User-space imports to this namespace produce a hard error
- Namespace exclusivity is enforced at resolution time

---

## 6. CSS Injection Strategy

- CSS is collected per-page during compilation
- Served via virtual CSS module (`\0zenith:css:<page>`)
- Keyed strictly by page ID — no cross-page bleed
- No inline `<style>` injection by the bundler

---

## 7. Entry Generation Shape

The emitted page module contains two layers:

1. **Virtual page scaffold** (backward-compatible exports):

```js
export const __zenith_html = `<escaped-html-template>`;
export const __zenith_expr = ["expr1", "expr2"];
export const __zenith_contract = "v0";
export default function __zenith_page() {
  return { html: __zenith_html, expressions: __zenith_expr, contract: __zenith_contract };
}
```

2. **Hydration bootstrap payload tables** consumed by the runtime:

```js
const __zenith_expression_bindings = [...];
const __zenith_markers = [...];
const __zenith_events = [...];
const __zenith_refs = [...];
const __zenith_state_values = [...];
const __zenith_state_keys = [...];
const __zenith_signals = [...];
const __zenith_components = [...];
const __zenith_expr_fns = [...]; // optional

import { hydrate } from '@zenithbuild/runtime';

function __zm(root = document, params = {}) {
  const __zenith_unmount = hydrate({
    root,
    ir_version: __zenith_ir_version,
    expressions: __zenith_expression_bindings,
    expr_fns: typeof __zenith_expr_fns !== 'undefined' ? __zenith_expr_fns : [],
    markers: __zenith_markers,
    events: __zenith_events,
    refs: __zenith_refs,
    state_values: __zenith_state_values,
    state_keys: __zenith_state_keys,
    signals: __zenith_signals,
    components: __zenith_components,
    route: __zenith_route_pattern,
    ssr_data: __zenith_ssr_data,
    props: typeof props !== 'undefined' ? props : {},
    params
  });
  return __zenith_unmount;
}
export { __zm as __zenith_mount };
```

- Template literal uses backtick escaping (`` \` ``, `\\`, `\${`)
- Expression strings use double-quote escaping (`\"`, `\\`, `\n`, `\r`, `\t`)

---

## 8. Dev Mode HMR Injection Location

When dev mode is active, the HMR footer is **appended after all exports**:

```js
/* zenith-hmr */
if (import.meta.hot) { import.meta.hot.accept(); }
```

- Appears **once** per module
- **Never** mutates exports
- **Never** re-orders exports
- **Never** wraps the module
- **Absent** in production builds

---

## 9. Rolldown Commit Pin

Current pinned revision: `67a1f58`

If Rolldown is updated, all determinism guarantees must be re-validated
and the `EXPECTED_ROLLDOWN_COMMIT` constant in `utils.rs` must be updated.

---

## 10. Zero Semantic Guarantee

The bundler **must never**:
- Reinterpret Zenith source semantics
- Modify the meaning of an expression
- Rename public contract symbols
- Add behavior beyond the HMR footer and the hydration bootstrap that calls
  the runtime's `hydrate(payload)`

The bundler **may**:
- Parse, inspect, and codegen JavaScript/AST when emitting runtime expression
  functions, rewriting imports, or executing minification paths
- Rewrite non-semantic output shape (for example whitespace, import specifiers,
  module collection) as long as runtime-visible semantics stay unchanged

The bundler is a **structural transformer and codegen harness** plus a thin
hydration bootstrap. All runtime interpretation is delegated to the runtime
contract.

---

## 11. Hash Determinism Rule

- Hash is computed on **final emitted JS (post-minification, post-region-strip)**.
- Expression strings are included **exactly as emitted**.
- Whitespace inside expressions is **significant**.
- Whitespace changes in source expressions **change the final hash**.
- Bundler **does not canonicalize** JavaScript expressions.

---

## 12. Vendor Bundling Contract

- Vendor bundling supports **third-party ESM libraries** (for example `gsap`, `three`, `date-fns`).
- Vendor bundling **does not imply framework interop**. React/Vue/Svelte/Solid/etc. are out-of-scope until an explicit adapter/islands layer exists.
- Framework imports are a hard error:
  - `react`, `react-dom`, `vue`, `svelte`, `solid-js`, `preact`, `lit`, `@angular/core` (including subpaths)
  - Diagnostic text:
    - `Framework interop imports are not supported yet. If you want this, we need an explicit adapter/islands layer.`
- Vendor filename hash is deterministic and seeded from:
  - lockfile content hash
  - pinned Rolldown revision
  - sorted external specifiers
  - emitted vendor chunk code
- Manifest always exposes vendor as top-level deterministic path when externals exist:
  - `vendor: "/assets/vendor.<hash>.js"`

## 13. CSS Input Contract

- Zenith bundles local `.css` files deterministically as opaque input.
- Local Tailwind v4 entry files are compiled internally when the imported CSS contains `@import "tailwindcss"` or `@import 'tailwindcss'`.
- Import a local CSS entry file (for example `./styles/global.css`) and put the raw Tailwind import inside that file.
- Final emitted CSS must never ship a raw `@import "tailwindcss"` directive; that is a build-time-only input and remains a hard error if it survives emission.
