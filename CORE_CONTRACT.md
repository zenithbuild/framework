# CORE_CONTRACT.md — Deterministic Utility Substrate

Canonical public docs: `../zenith-docs/documentation/contracts/core-contract.md`

> **This document is a legal boundary.**
> Core is a shared utility layer. It contains no business logic,
> no routing, no DOM, no framework behavior. Pure helper substrate only.
>
> **Standalone test:** If `zenith-core` were published alone on npm,
> it must make sense as a generic deterministic utility library.

## Status: FROZEN (V0)

---

## 1. Core Identity

Core provides deterministic **transforms**, **formatting**, and **schema validation**.

**Core provides:**
- Deterministic transforms: `hash`, `normalizePath`, `sortRoutes`, `parseConfig`, `parseSemver`
- Deterministic formatting: `formatError`
- Deterministic schema validation: `validateConfigSchema`, `validateRouteParams`

**Core does NOT:**
- Scan repositories
- Enforce cross-layer behavior
- Know about router semantics
- Know about bundler internals
- Police other layers' architecture

---

## 2. Allowed Modules

| Module | Purpose |
|---|---|
| `config.js` | Load + validate config schema |
| `path.js` | Normalize paths + `[param]` → `:param` |
| `order.js` | Static-first stable sort |
| `hash.js` | SHA-256 content hashing |
| `errors.js` | Error factory + prefixing |
| `version.js` | SemVer parsing + major compatibility |
| `guards.js` | Small pure validation helpers |
| `index.js` | Re-exports |

---

## 3. Determinism Guarantees

| Rule | Guarantee |
|---|---|
| Hashing | Same input → same hash, cross-platform |
| Ordering | Stable sort: static first, dynamic after, alpha tiebreak |
| Paths | Normalized separators (`/`), consistent param format |
| Config | Missing keys → explicit defaults, unknown keys → throw |
| Errors | Consistent format: `[Zenith:MODULE] message` |

---

## 4. Explicit Prohibitions

Core source **must never**:

1. Import from `@zenithbuild/compiler`, `@zenithbuild/bundler`, `@zenithbuild/runtime`, or `@zenithbuild/router`
2. Reference `window`, `document`, `navigator`, or any browser API
3. Use `eval()`, `new Function()`, or `document.write()`
4. Perform build orchestration of any kind
5. Access the filesystem **except when explicitly loading `zenith.config.js`**
6. Mutate global state
7. Contain preset/mode logic (`basic`, `router`, `fullstack` belong in `create-zenith`)
8. Initiate version checks against other packages (other layers call core's utility)

---

## 5. Hash Contract

- Algorithm: **SHA-256** via `node:crypto`
- Output: **hex string**
- Input normalization: path separators → `/`, trailing newlines stripped

> **Critical rule:** Hash algorithm must match bundler's algorithm exactly.
> If bundler changes hash algorithm, core must change in lockstep.

---

## 6. Config Schema (V0)

```js
// zenith.config.js
export default {
  router: false,    // boolean — opt-in client router
  outDir: 'dist',   // string — output directory
  pagesDir: 'pages' // string — pages directory
}
```

| Key | Type | Default | Validation |
|---|---|---|---|
| `router` | `boolean` | `false` | Must be boolean |
| `outDir` | `string` | `'dist'` | Non-empty string |
| `pagesDir` | `string` | `'pages'` | Non-empty string |

Unknown keys → throw `[Zenith:Config] Unknown key: "foo"`.

**No other keys for V0.** No `mode`, `target`, `presets`, `experimental`, `base`, `assetsDir`.

---

## 7. Version Compatibility API

```js
validateCompatibility(coreVersion, otherVersion)
// Throws if major versions differ
// Warns if minor versions differ by > 1
```

**Direction of control:** Other layers call this function.
Core never imports other packages to auto-check.

---

## 8. Guard Helpers

Guards are **small pure validation helpers**:

```js
containsForbiddenPattern(source, patterns)  // returns boolean
validateRouteParams(routePath)              // throws on repeated params
validateConfigSchema(config)                // throws on unknown keys / wrong types
```

Guards do NOT:
- Scan entire repositories
- Enforce architectural decisions
- Assert that other layers used sorting correctly

---

## 9. Dependency Rules

- **Zero dependencies on other Zenith packages**
- Zero runtime npm dependencies
- Dev dependencies: Jest only
- Pure ESM, Node.js built-ins only
