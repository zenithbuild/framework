# BUNDLER_CONTRACT.md — Sealed Runtime Interface

Canonical public docs: `../zenith-docs/documentation/contracts/bundler-contract.md`


> **This document is a legal boundary.**
> No symbol rename, no structural change, no semantic reinterpretation
> is permitted after this contract is frozen.

## Status: FROZEN

---

## 1. Export Symbols

| Symbol | Type | Binding | Notes |
|---|---|---|---|
| `__zenith_html` | `string` | `export const` | Template literal (backtick-delimited) |
| `__zenith_expr` | `string[]` | `export const` | Array literal, never reassigned |
| `__zenith_page` | `function` | `export default` | Returns `{ html, expressions }` |

### Export Order (Guaranteed)

```
1. export const __zenith_html = `...`;
2. export const __zenith_expr = [...];
3. export default function __zenith_page() { ... }
```

This order is frozen. Tests enforce `__zenith_html` appears before `__zenith_expr`.

---

## 2. Expression Array Contract

- Type: **Array literal** of string values
- Binding: **const** (never `let` or `var`)
- Order: **Left-to-right, depth-first** (compiler guarantee, passthrough)
- Content: **Exact strings from source** — no transformation, no renaming
- Index stability: Expression at index `N` always corresponds to `data-zx-e="N"`

---

## 3. Data Attributes

| Attribute | Format | Purpose |
|---|---|---|
| `data-zx-e` | `data-zx-e="<index>"` | Expression binding point |
| `data-zx-on-*` | `data-zx-on-click="<index>"` | Event handler binding point |

Index values are 0-based integers matching `__zenith_expr` array positions.

---

## 4. Virtual Module Namespace

| Prefix | Internal | User-resolvable |
|---|---|---|
| `\0zenith:entry:<page>` | ✅ | ❌ |
| `\0zenith:css:<page>` | ✅ | ❌ |
| `\0zenith:page-script:<page>` | ✅ | ❌ |

- All virtual IDs start with `\0` (null byte) + `zenith:`
- User-space imports to this namespace produce a hard error
- Namespace exclusivity is enforced at resolution time

---

## 5. CSS Injection Strategy

- CSS is collected per-page during compilation
- Served via virtual CSS module (`\0zenith:css:<page>`)
- Keyed strictly by page ID — no cross-page bleed
- No inline `<style>` injection by the bundler

---

## 6. Entry Generation Shape

```js
export const __zenith_html = `<escaped-html-template>`;
export const __zenith_expr = ["expr1", "expr2"];
export default function __zenith_page() {
  return { html: __zenith_html, expressions: __zenith_expr };
}
```

- Template literal uses backtick escaping (`` \` ``, `\\`, `\${`)
- Expression strings use double-quote escaping (`\"`, `\\`, `\n`, `\r`, `\t`)

---

## 7. Dev Mode HMR Injection Location

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

## 8. Rolldown Commit Pin

Current pinned revision: `67a1f58`

If Rolldown is updated, all determinism guarantees must be re-validated
and the `EXPECTED_ROLLDOWN_COMMIT` constant in `utils.rs` must be updated.

---

## 9. Zero Semantic Guarantee

The bundler **must never**:
- Inspect AST nodes
- Modify expression content
- Interpret import semantics
- Rewrite data attributes
- Rename symbols
- Add runtime behavior beyond HMR footer

The bundler is a **pure structural transformer**.

---

## 10. Hash Determinism Rule

- Hash is computed on **final emitted JS (post-minification, post-region-strip)**.
- Expression strings are included **exactly as emitted**.
- Whitespace inside expressions is **significant**.
- Whitespace changes in source expressions **change the final hash**.
- Bundler **does not canonicalize** JavaScript expressions.

---

## 11. Vendor Bundling Contract

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

## 12. CSS Input Contract

- Zenith bundles local `.css` files deterministically as opaque input.
- CSS framework processors (for example Tailwind) are out-of-band pre-steps in this phase.
- Import the compiled CSS artifact (for example `./styles/output.css`) and Zenith will include it in the deterministic CSS pipeline and single injected stylesheet link.
