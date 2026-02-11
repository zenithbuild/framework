# CLI_CONTRACT.md — Sealed Project Orchestrator

> **This document is a legal boundary.**
> The CLI is a deterministic project orchestrator.
> It is not a framework, router, bundler, or compiler.
> It is the glue.

## Status: FROZEN (V0)

---

## 1. CLI Identity

The CLI:
- Scans `/pages` directory
- Generates deterministic `RouteManifest`
- Calls the compiler
- Calls the bundler
- Writes output to `/dist`
- Starts dev server
- Serves static output in preview mode

The CLI does **not**:
- Own navigation, hydration, reactivity, mounting, or diffing
- Those belong to `@zenithbuild/runtime` and `@zenithbuild/router`

---

## 2. Execution Modes

| Command | Behavior |
|---|---|
| `zenith dev` | Dev server + HMR + in-memory compilation |
| `zenith build` | SSG output to `/dist` |
| `zenith preview` | Static server over `/dist` (no compile, no bundle) |

---

## 3. Config Surface

```js
// zenith.config.js
export default {
  router: true  // opt-in only
}
```

| Key | Type | Default | Behavior |
|---|---|---|---|
| `router` | `boolean` | `false` | If `true`, CLI injects client router script and uses manifest at runtime |

**Router is opt-in only.** If absent or `false`:
- No router script injected
- Native MPA navigation
- No client-side route resolution

---

## 4. File-Based Manifest Rules

The CLI converts the `/pages` directory into a `RouteManifest`:

| File Path | Route |
|---|---|
| `pages/index.zen` | `/` |
| `pages/about.zen` | `/about` |
| `pages/users/[id].zen` | `/users/:id` |
| `pages/docs/api/index.zen` | `/docs/api` |

**Rules:**
- `index.zen` maps to the parent directory path
- `[param].zen` maps to `:param` dynamic segment
- No nested param syntax (e.g. `[a][b].zen` is invalid)
- No optional params
- No wildcards
- No repeated param names across the path

**Ordering (deterministic):**
1. Static routes first
2. Dynamic routes after
3. Alphabetically sorted within each category

This keeps the router's first-match-wins predictable.

---

## 5. SSG Output Structure

```
dist/
├── index.html
├── about/
│   └── index.html
├── assets/
│   ├── [hash].js
│   └── [hash].css
```

**Rules:**
- Each page produces one HTML file
- No JS emitted for static-only pages (no expressions)
- Runtime included only if page contains reactive expressions
- JS/CSS filenames are content-hashed (bundler rule)
- Rebuild must produce identical hashes for identical input

---

## 6. CLI Prohibitions (Forbidden)

The CLI **must never**:

- Contain routing logic
- Manipulate the DOM
- Inject runtime behavior (beyond what the compiler contract specifies)
- Rewrite AST or JS expressions
- Normalize emitted JavaScript
- Apply hidden config defaults
- Auto-inject router without explicit `router: true`
- Default to SPA mode
- Use `eval()` or `new Function()`
- Reference `window`, `document`, or browser globals

---

## 7. Build Pipeline

```
pages/*.zen
    ↓ manifest.js (scan → RouteManifest)
    ↓ compiler (per page → IR)
    ↓ bundler (IR → HTML + JS + CSS)
    ↓ dist/ (deterministic output)
```

Each stage is a discrete function call. No implicit chaining.

---

## 8. Dev Server Contract

- Serves compiled pages from memory
- Rebuilds on file change
- Injects HMR client script
- No SPA fallback unless `router: true`
- No production behavior in dev mode

---

## 9. Preview Server Contract

- Serves `/dist` directory only
- No compilation
- No bundling
- Pure static HTTP server
- Verifies build output is independent of dev mode

---

## 10. Router Integration (Conditional)

**If `router: true`:**
- CLI injects `<script>` tag referencing client router bundle
- Manifest used at runtime for client-side navigation
- Pages load via dynamic `import()` instead of full navigation

**If `router: false` (default):**
- No router script
- Standard `<a href>` navigation (MPA)
- Each page is self-contained

---

## 11. Alignment Verification

This contract is valid if and only if:

- [ ] CLI never contains routing logic
- [ ] CLI never manipulates DOM
- [ ] Manifest ordering is deterministic (static first, alpha sorted)
- [ ] SSG output matches input deterministically
- [ ] Router injection is opt-in only
- [ ] No `eval`, `new Function`, or browser globals in source
- [ ] Preview server serves only `/dist` (no compilation)
- [ ] Dev server rebuilds on file change
- [ ] No hidden config defaults
