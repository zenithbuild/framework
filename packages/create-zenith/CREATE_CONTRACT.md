# CREATE_CONTRACT.md — Deterministic Project Scaffolder

Canonical public docs: `../../docs/documentation/contracts/create-contract.md`


> **This document is a legal boundary.**
> `create-zenith` is a dumb scaffolder. It generates files and exits.
> It creates the project structure but owns NO runtime, build, or architectural logic.

## Status: FROZEN (V0)

---

## 1. Identity

`create-zenith` is a **deterministic project generator**.
It inputs a directory name and a preset choice.
It outputs a file tree.
It **optionally** runs a package manager install (side-effect).
It then terminates.

---

## 2. Allowed Responsibilities

- **Template Copying**: Copying static assets from `templates/{preset}` to target.
- **Config Generation**: Writing `zenith.config.js` based on preset.
- **Package Manifest Rewriting**: Updating scaffolded `package.json` metadata such as app name while preserving the checked-in template dependency surface.
- **Project layout**: Creating specific directories (`pages`, `src`, `public`).
- **Interactive Prompts**: Asking for project name, template, and optional tooling selections (if not provided).
- **Package Manager Execution**: Running `install` command (detects pm, but does NOT alter output files).
- **Feature Overlays**: Adding optional ESLint / Prettier template overlays when explicitly selected.

---

## 3. Explicit Prohibitions

`create-zenith` **must never**:

1.  **Import Core, CLI, Router, Runtime, or Bundler**.
2.  **Contain build logic** (no bundling, no compilation).
3.  **Contain runtime logic** (no router code, no reactive state).
4.  **Parse `.zen` files** (text transfer only).
5.  **Enforce architecture** (no "linting" of generated code).
6.  **Use browser globals** (`window`, `document`).
7.  **Generate non-deterministic output** (no timestamps, no random IDs).
8.  **Inject hidden defaults** (what you see in the template is what you get).
9.  **Read versions from installed packages** to change scaffold output.
10. **Alter output based on package manager** (generated files must be identical regardless of npm/yarn/pnpm).

---

## 4. Templates

The shipped scaffolder templates are static bundles under `templates/`:

| Template | Description | Config | Key Feature |
|---|---|---|---|
| `basic` | Single-page starter | `router: false` | Minimal baseline with one route |
| `css` | Multi-page starter | `target: 'static'` | Curated CSS workflow |
| `tailwind` | Multi-page starter | `target: 'static'` | Tailwind-enabled workflow |

Rules:

- `templates/` is authoritative for scaffold output.
- `examples/` are demo-only and must not drive the generated file tree.
- Optional tooling overlays live under `templates/features/`.

---

## 5. File Structure (Generated)

Every generated project must have:

```text
my-app/
  ├── node_modules/   (if install ran)
  ├── src/
  │   ├── layouts/
  │   ├── pages/
  │   └── public/
  ├── package.json
  └── zenith.config.js
```

---

## 6. Determinism Guarantees

**Determinism applies to:**
- Generated file contents
- File structure
- Dependency versions (in `package.json`)

**Determinism does NOT apply to:**
- `node_modules` content
- Lockfile resolution
- `npm install` output / logs

For any given version of `create-zenith`:
- Same **Preset** + Same **Project Name** = **Identical File Tree** (files & content).

---

## 7. Version Authority

The scaffolded dependency surface is defined by the checked-in template manifests and explicit create-time rewrites.

`create-zenith` must not dynamically resolve versions from installed packages or mutate template dependencies based on the caller's package manager.

---

## 8. Hardening Tests

To verify compliance:
- [ ] **Snapshot Tests**: Each preset generates exact expected file tree.
- [ ] **Forbidden Import Scan**: Source scan ensures no imports of `@zenithbuild/*`.
- [ ] **Environmental Leakage Scan**: Generated files must NOT contain `Date`, `Math.random`, or `process.env`.
- [ ] **Determinism Check**: Two runs produce identical file hashes.
- [ ] **Lockfile Check**: Dependencies are correctly pinned.
