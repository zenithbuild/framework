# CORE_CONTRACT.md — Public Package Boundary and Deterministic Utility Layer

Canonical public docs: `../../docs/documentation/contracts/core-contract.md`

> **This document is a legal boundary.**
> `@zenithbuild/core` is the public dependency boundary for Zenith apps.
> It owns deterministic shared utilities and the public config/type surface.
> It does not own compiler semantics, router runtime behavior, or adapter packaging logic.

## Status: FROZEN (V0)

---

## 1. Core Identity

Core provides:

- the public `zenith` CLI entrypoint
- deterministic config loading and validation
- exported config/build-manifest/adapter types
- path ordering, hashing, error, version, and schema helpers
- the generated core-module source bridge used by the framework runtime boundary

Core does not:

- classify routes or execute navigation
- hydrate DOM or run runtime bindings
- bundle assets or package adapters
- reinterpret compiler output downstream

---

## 2. Allowed Modules

| Module | Purpose |
|---|---|
| `config.ts` | Load + validate config schema |
| `config-types.ts` | Public config, manifest, and adapter types |
| `path.ts` | Normalize paths + `[param]` → `:param` |
| `order.ts` | Static-first stable sort |
| `hash.ts` | SHA-256 content hashing |
| `errors.ts` | Error factory + prefixing |
| `version.ts` | SemVer parsing + major compatibility |
| `guards.ts` | Small pure validation helpers |
| `schema.ts` / `ir/` | Shared IR/schema exports |
| `core-template.ts` | Deterministic generated core module bridge |
| `index.ts` | Re-exports |

---

## 3. Determinism Guarantees

| Rule | Guarantee |
|---|---|
| Hashing | Same input → same hash, cross-platform |
| Ordering | Stable sort: static first, dynamic after, alpha tiebreak |
| Paths | Normalized separators (`/`), consistent param format |
| Config | Missing keys → explicit defaults, unknown keys → throw |
| Errors | Consistent format: `[Zenith:MODULE] message` |
| Config loading | Exactly one of `zenith.config.ts` or `zenith.config.js` is loaded |

---

## 4. Public Config Surface

Top-level Zenith config keys currently validated by core:

```ts
export default defineConfig({
  router: false,
  embeddedMarkupExpressions: false,
  typescriptDefault: true,
  outDir: 'dist',
  pagesDir: 'pages',
  basePath: '/',
  target: 'static',
  adapter: null,
  strictDomLints: false,
  images: {}
});
```

Rules:

- `target` and `adapter` are mutually exclusive
- unknown top-level keys throw
- `basePath` is normalized and must stay path-only
- `images` is a structured config object validated by core

## 5. Explicit Prohibitions

Core source must never:

1. Reference `window`, `document`, `navigator`, or browser-only APIs.
2. Use `eval()`, `new Function()`, or `document.write()`.
3. Perform dev/build/preview orchestration.
4. Infer route protection, router, or adapter behavior from app source.
5. Read project files other than explicit config loading.
6. Mutate process-wide framework state as hidden behavior.
7. Invent hidden config defaults or silently accept unknown config keys.

---

## 6. Hash Contract

- Algorithm: **SHA-256** via `node:crypto`
- Output: **hex string**
- Input normalization: path separators → `/`, trailing newlines stripped

> **Critical rule:** Hash algorithm must match bundler's algorithm exactly.
> If bundler changes hash algorithm, core must change in lockstep.

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

## 9. Boundary Rule

If a capability changes route behavior, bundling, runtime DOM behavior, or adapter packaging, core may type or validate its config shape but it must not become the implementation owner.
