# Phase 3 Feature Expansion Tracker

## 1. Executive Summary
Phase 3 continues Zenith's feature-forward work after the first-target Phase 2 scope is complete. It exists to compound the user-facing value of the shipped runtime, routing, deployment, and asset surfaces without reopening compiler, config, plugin, or runtime foundations unless a verified live regression appears.

Phase 3 priorities:
- polish newly shipped primitives into stable DX truth
- compose visible product behavior on top of existing lifecycle boundaries
- keep feature slices narrow and mechanically testable
- preserve canonical Zenith-first naming while allowing optional convenience aliases

## 2. Proposed Tracks / Milestone Slices
- **Track A** — Presence DX Alias & Documentation Polish (Complete)
- **Track B** — Visual Navigation Shell on Existing Lifecycle (Complete — first target `zenNavigationShell`)
- **Track C** — Overlay / Surface Composition Patterns (Complete — first target always-mounted overlay/sheet pattern)

## 3. Active Item
### Phase 3 Track C — Overlay / Surface Composition Patterns
**Status:** Complete

**Scope boundary:**
- one always-mounted overlay/surface composition pattern built on existing primitives only
- no hidden DOM ownership
- no fragment retention or delayed unmount behavior
- no generalized overlay manager, portal system, or new runtime/compiler primitive

**Approved first target:** canonical documented always-mounted overlay/sheet pattern

**Outcome:** Zenith now ships one canonical docs/demo pattern that:
- keeps one always-mounted overlay root and one always-mounted panel as explicit refs
- uses `zenPresence(...)` as the only visibility primitive
- wires backdrop click and Escape through `zenMount(...)` with deterministic cleanup
- explains optional outer-shell composition with `zenNavigationShell(...)` without depending on it
- stays explicitly out of portal systems, focus-trap platform work, hidden DOM ownership, and generalized overlay managers

**Next:** no additional Phase 3 slice has been approved yet. Future work should stay additive and avoid reopening framework foundations without live regression evidence.

## 4. Completed Items
### Phase 3 Track C — Overlay / Surface Composition Patterns
**Status:** Complete

**What shipped:**
- [x] Canonical always-mounted overlay/sheet guidance now exists as a focused public guide.
- [x] The modal demo now teaches backdrop click, Escape handling, ref ownership, and deterministic cleanup.
- [x] Presence and primitives docs now point to the canonical overlay/sheet pattern rather than leaving surface composition implicit.
- [x] Navigation shell docs include the optional outer-shell composition note while keeping overlay ownership local.
- [x] Docs/demo truth landed without adding new runtime or router primitives.

### Phase 3 Track B — Visual Navigation Shell on Existing Lifecycle
**Status:** Complete

**What shipped:**
- [x] Canonical `zenNavigationShell(ref, options)` exported from `@zenithbuild/router`.
- [x] The utility subscribes only to the existing router lifecycle and leaves router templates untouched.
- [x] Shell phase is explicit and stable: `idle`, `leaving`, `swapping`, `entering`.
- [x] `navigation:abort` and `navigation:error` reset shell state deterministically and cancel stale pending shell work.
- [x] Docs now include a dedicated guide, compile-checked demo, composition guidance with `zenPresence(...)`, cleanup notes, and explicit non-goals.

### Phase 3 Track A — Presence DX Alias & Documentation Polish
**Status:** Complete

**What shipped:**
- [x] Canonical `zenPresence(...)` remains primary.
- [x] Optional `presence(...)` alias now exists as a secondary convenience name.
- [x] Runtime exports, tests, and runtime bundle truth recognize both names while preserving canonical ordering.
- [x] Presence docs now include a dedicated guide, multiple examples, phase semantics, timeout fallback behavior, cleanup guarantees, and explicit non-goals.
- [x] Docs/examples/tests continue to present `zenPresence(...)` first and `presence(...)` second.

## 5. Risks
- **Alias inversion:** plain `presence(...)` could accidentally become the public-first name in docs or examples. **Mitigation:** keep `zenPresence(...)` first in exports, tests, and canonical docs; lock ordering mechanically.
- **Transition framework creep:** presence polish can drift into router coupling, fragment retention, or general animation abstractions. **Mitigation:** keep Track B and Track C explicitly bounded to existing lifecycle ownership and ref-owned DOM surfaces only.
- **Docs/runtime drift:** additive DX work can create documentation that outpaces tested runtime truth. **Mitigation:** docs gates and runtime truth tests must remain part of every scoped slice.

## 6. Exit Criteria
- [x] **Track A:** `zenPresence(...)` remains canonical, `presence(...)` exists as an optional alias, and docs/tests/examples are aligned.
- [x] **Track B:** A visual navigation shell uses only the existing awaited router lifecycle barriers and cleans up correctly on `abort` / `error`.
- [x] **Track C:** One overlay/surface composition pattern builds on existing presence + ref ownership without adding hidden DOM ownership or new runtime primitives.
- [ ] Structural rules and closure records from Phases 0, 1, and 2 remain intact.
