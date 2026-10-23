# Phase 1 Product Surface Tracker

## 1. Executive Summary
Phase 1 is not a security or correctness hardening sweep. It is focused entirely on **product-surface finalization**. Building upon the explicit, trustworthy foundations locked during Phase 0, this phase aims to define precisely what Zenith supports, eradicate any lingering ambiguity in public contracts, and transform deferred architectural boundaries into locked, canonical product truth.

**Top Goals:**
- Establish a definitive and validated Configuration Contract.
- Clearly define the Plugin/Extension capability boundary (even if that definition remains "closed" or "internal-only").
- Clarify the Runtime Scheduling and Reactivity Model.
- Land only the deferred core primitives required to complete locked runtime/product contracts.

## 2. Track Overview
- **Track A** — Config Contract Finalization
- **Track B** — Plugin & Extension Truth
- **Track D** — Deferred Core Primitives
- **Track E** — Performance & Maintainability Focus
- **Track F** — Release & Process Hardening

## 3. Active Item
## Phase 1 Track F — Release & Process Hardening
**Status:** Active

### Sub-items
- [x] Authoritative publishable-package matrix and tarball verifier
- [x] Truthful dry-run behavior for framework and scaffolder publish scripts
- [x] CI package-surface verification gate for all publishable packages
- [x] Post-publish dist-tag/version verification artifact
- [x] GitHub release gated on npm verification, not workflow success alone
- [x] Dead/stale package verification removed; one authoritative path remains

## 4. Completed Items
- **Track A** — Config Contract Finalization
  - Canonical config schema defined (10 keys).
  - Precedence order strictly defined (File > Default).
  - Config loader trust boundary and transpilation documented.
  - Docs vs Implementation mechanical parity tests added and passing.
- **Track B** — Plugin & Extension Truth
  - Plugin surface explicitly documented as closed.
  - Adapter confirmed as a narrowly scoped advanced deployment surface, not a general extension model.
  - False compiler middleware, router lifecycle hooks, and runtime/DOM extension claims removed from CONTRIBUTING.md.
  - Mechanical drift locks added to prevent fake lifecycle terms from returning.
- **Track C** — Runtime & Reactivity Clarification
  - Explicitly documented microtask default deferral, synchronous execution, and macro-task schedulers (RAF/debounce).
  - Formally defined `cleanup()` as the idempotent deterministic disposal boundary with no leaked subscriptions.
  - Confirmed canonical public API (`zeneffect`, `zenMount`, `zenDocument`, `zenWindow`), with standard non-prefixed names documented distinctly as optional secondary aliases.
  - Mechanical test locks are in place for all scheduling and lifecycle invariants; test runner migrated to native Bun.
- **Track D** — Deferred Core Primitives
  - Prop transport schema truth was locked and kept deterministic across compile/runtime boundaries.
  - Deferred fragment patching and ownership mechanics were finalized without widening the public runtime surface.
  - Ref ownership/runtime boundary behavior was carried into tests/docs as canonical Phase 1 truth.
- **Track E** — Performance & Maintainability Focus
  - Hydration comment-boundary resolution now uses a single TreeWalker scan per hydrate call and is locked mechanically.
  - `hydrate.js` and `zeneffect.ts` were decomposed by responsibility into authoritative modules; duplicate ghost logic was removed.
  - Maintainability locks now enforce the extracted runtime boundaries and prevent the prior monolith regressions from returning.

---

## 5. Exit Criteria
- [x] Config loading, precedence, and schema validation are strictly defined and locked.
- [x] Zenith's extension/plugin model is documented and bound by code (explicitly allowing "not public yet").
- [x] Zenith's runtime behavior is explicitly locked: `zeneffect` scheduling, scope cleanup, and bootstrapping rules.primitives are formally documented and tested for ordering.
- [x] Release dry-runs and CI package-publishing paths and package verification are strictly verified.

## 6. Deferred / Explicitly Out of Scope
- new plugin capabilities beyond final public truth
- new config keys for unshipped features
- runtime rewrites beyond contract clarification
- speculative performance work without a locked primitive or measured bottleneck
