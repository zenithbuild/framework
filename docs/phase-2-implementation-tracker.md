# Phase 2 Implementation Tracker: Feature Realization

## 1. Executive Summary
Phase 2 is the first feature-forward phase built on top of the locked contracts from Phases 0 and 1. The objective of this phase is to turn Zenith's robust product surface into visible product value. It strictly builds upon the completed contracts, without performing broad structural rewrites or reopening runtime, compiler, config, or plugin foundations (unless a verified live regression surfaces). The scope of all new capability tracks is governed rigidly to prioritize delivery of mechanical, product-facing functionality.

## 2. Track Overview
- **Track A** — Server Actions & Data Mutation (Complete)
- **Track B** — Native Asset Pipeline & Image Materialization (Complete — scoped milestone; optional continuation deferred)
- **Track C** — Adapter Target Expansion & SSG (Complete — first target `static-export`)
- **Track D** — High-Fidelity UI / Transition Primitive (Complete — first target `zenPresence`)

## 3. Active Item
### Phase 2 Track D — High-Fidelity UI / Transition Primitive
**Status:** Complete

**Approved first target:** `zenPresence(ref, options)`

**Outcome:** Zenith now ships one narrow canonical presence helper that:
- owns always-mounted visibility on a ref-bound node
- starts entry only after the mount boundary via `presence.mount()` inside `zenMount(...)`
- exposes deterministic `hidden | entering | present | exiting` phase truth on `data-zen-presence`
- settles through owned `transitionend` / `animationend` listeners with timeout fallback
- clears listeners/timers on rerun and cleanup with no ghost work
- does not retain fragments, delay conditional unmount, or couple to router lifecycle

**Next:** Phase 2 first-target track scope is complete. Any broader transition shell, route orchestration, or delayed-unmount work requires a separate milestone decision.

**Note:** Track B image pipeline work for static props + compiler artifacts + registry train is closed; further image scope (bundler HTML materialization, CDN, dynamic props) remains **deferred** and is not required to reopen Track B unless a new milestone is chartered.

## 4. Completed Items
### Phase 2 Track D — High-Fidelity UI / Transition Primitive
**Status:** Complete

**What shipped:**
- [x] `zenPresence(ref, options)` exported from the runtime as a narrow explicit import surface.
- [x] Canonical usage is `zenMount((ctx) => ctx.cleanup(presence.mount()))` plus reactive `presence.setPresent(next)`.
- [x] Presence phases are explicit and stable: `hidden`, `entering`, `present`, `exiting`.
- [x] Phase completion uses owned `transitionend` / `animationend` listeners with deterministic timeout fallback.
- [x] Reruns and cleanup cancel pending listeners/timers with no ghost work.
- [x] Docs/examples explicitly keep the scope narrow: always-mounted nodes only, no fragment retention, no router coupling, no compiler/global keyword expansion.

### Phase 2 Track C — Adapter Target Expansion & SSG
**Status:** Complete

**What shipped:**
- [x] New explicit `target: 'static-export'` recognized in config truth, adapter resolution, and canonical docs.
- [x] `static-export` consumes existing manifest route truth (`render_mode`, `path_kind`, canonical route path) without redefining route meaning inside the adapter.
- [x] Dynamic prerender routes may declare `export const exportPaths = [...]` as a literal concrete export-path contract.
- [x] `static-export` fails hard on `render_mode: 'server'` routes.
- [x] `static-export` fails hard on dynamic prerender routes without explicit `exportPaths`.
- [x] Final output is rewrite-free and directly serveable by a plain static file server, including base-path-nested public assets and HTML files.
- [x] Route-check and image endpoint support remain out of scope and unsupported for this target.

### Phase 2 Track B — Native Asset Pipeline & Image Materialization
**Status:** Complete (scoped)

**Purpose:** Move the image and asset path toward compiler/bundler-owned truth, removing remaining CLI-only post-build heuristics that are not backed by explicit structured artifacts.

**What shipped (Sub-steps 1–4):**
- [x] **Sub-step 1 — Bundler transport authority for `image_materialization`:** CLI `runBundler()` sends the full page envelope on stdin (no stripping); bundler-emitted `assets/router-manifest.json` carries `image_materialization`; CLI post-step only patches server metadata from `envelope.ir` (guard/load/action refs). Verified by CLI seam + bundler integration tests.
- [x] **Sub-step 2 — Compiler-owned static `image_materialization` artifact:** `CompilerOutput` includes `image_materialization` (ordered `{ selector, props }[]`) produced by a narrow Rust pass that pairs `data-zenith-image` / `unsafeHTML` markers with CLI-supplied static object-literal strings (no broad constant evaluation). CLI `page-loop` / `page-component-loop` prefer this artifact via `mergePageImageMaterialization`; TS reconstruction in `materialization-plan.js` is stubbed for transition. Compiler positive/negative tests; bundler `CompilerOutput` structs updated; CLI image + security gates green.
- [x] **Sub-step 3 — Shipped compiler + CI truth for image artifact:** `scripts/verify-compiler-shipped-surface.mjs` runs after `build.sh` and asserts the **staged** `packages/compiler-<platform>/bin/zenith-compiler` documents `--merge-image-materialization`; `jest-setup.cjs` respects explicit `ZENITH_COMPILER_BIN` and prefers release over debug when unset; `tests/compiler-shipped-image-artifact.spec.js` covers resolution + merge stdin.
- [x] **Sub-step 4 — Registry train `0.7.4`:** `TRAIN_VERSION` and lockstep packages bumped so published `@zenithbuild/compiler` and optional `@zenithbuild/compiler-*` tarballs match the verified binary. **Publish:** push tag `v0.7.4` from `master` per [`docs/_internal/release-policy.md`](_internal/release-policy.md) so [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) runs OIDC publish. **Post-publish:** `node scripts/verify-npm-registry-train.mjs` (expects all listed compiler packages at `TRAIN_VERSION`).

**Explicit non-goals preserved (still deferred):**
- no broad CDN/platform expansion
- no dynamic evaluation for image props
- no fake convenience fallbacks
- no generic runtime image inference
- final HTML materialization in bundler (optional future Track B continuation)
- optional `compiler-linux-arm64` (or similar) platform package if that platform ships

### Phase 2 Track A — Server Actions & Data Mutation
**Status:** Complete

**Delivered:**
- canonical `action(ctx)` route mutation primitive on the existing server route boundary
- canonical expected-failure path via `invalid(payload, 400|422)`
- `guard -> action -> load` execution for `POST` requests
- `ctx.action` handoff into `load(ctx)` and route re-rendering
- opt-in progressive enhancement via `form[data-zen-form]`
- direct request parity across dev, preview, and packaged server output

**Explicit non-goals preserved:**
- no optimistic mutation engine
- no streaming mutation protocol
- no broad RPC surface
- no broad file-upload abstraction
- no background job framework

## 5. Risks
- **Erosion of Contracts via Feature Strain:** As feature scale increases, there may be friction against the hard locks placed in Phase 0/1. **Mitigation:** All features must adapt to existing boundaries; if the feature demands unwinding a core Phase 0 decision, the feature itself must be narrowed.
- **Scope Creep / Target Chasing:** It is tempting to solve ten deployment platforms or ten mutation paradigms. **Mitigation:** Each track strictly defines the "one" canonical approach and specifically delegates broad platform/ecosystem integrations out of scope.

## 6. Exit Criteria
- [x] **Track A:** A single, secure, canonical mutation primitive successfully manages client-to-server form data.
- [x] **Track B (scoped):** Static `Image` props use compiler-owned `image_materialization` + bundler route transport; optional CLI reinjection for covered cases removed; train `0.7.4` aligns npm compiler packages with `--merge-image-materialization`. Broader exit (all assets / bundler-final HTML) remains **deferred** per Track B non-goals above.
- [x] **Track C:** One new explicit deployment target correctly processes SSG/prerender output via verified compilation.
- [x] **Track D:** A narrow, predictable transition/presence pattern integrates cleanly into the established DOM deterministic patch loop.
- [ ] None of the structural rules, safety bounds, or compiler assumptions guaranteed in Phase 0 and 1 have been bypassed.
