# Track D: Deterministic Fragment Patch Loop & Ref Ownership Locks

## Problem

`hydrate.js` is 2125 lines — far above the 500-line file limit — and contains two critical defects:

1. **`_mountStructuralFragment` uses `container.innerHTML = ''`** (line 1901), which nukes all child DOM nodes, destroys sibling event listeners, and forces full re-creation on every update.
2. **Ref lifecycle is partially wired** — `ref.current` gets populated and cleaned up via disposer (lines 101-122), but there are no mechanical tests proving the exact ownership contracts beyond a basic happy path.

## User Review Required

> [!CAUTION]
> This plan extracts ~400 lines of fragment/rendering logic from `hydrate.js` into a new `fragment-patch.js` module. The shared patch primitive replaces the `innerHTML = ''` nuke pattern. Both element-bound and comment-range surfaces will use the same engine.

> [!IMPORTANT]
> The existing test suite runs `npm run build && bun test` — builds from `dist/`. All new modules need corresponding entries in `tsconfig.build.json` if they're `.ts`, or just co-located as `.js` like `hydrate.js`.

## Proposed Changes

### Runtime: Fragment Patch Module (New)

#### [NEW] [fragment-patch.js](file:///Users/judahsullivan/Personal/zenithbuild-monorepo/packages/runtime/src/fragment-patch.js)

The shared ordered patch primitive. Contains:

- **`createFragmentRegion()`** — Returns a region tracker: `{ mount, update, destroy }`.
- **Per-index tracking** — Each array index owns a bounded region of DOM nodes + cleanup handles.
- **`_patchRegions(oldItems, newItems, ctx)`** — The core loop:
  - For each index `i` in the new array:
    - If `old[i] === new[i]`, skip (preserve region).
    - Otherwise, unmount old region at index `i`, mount new region at index `i`.
  - If new array is shorter: unmount trailing old regions.
  - If new array is longer: append new regions.
  - **No keys. No heuristics. No reconciliation.**
- **`mountItemIntoRegion(item, ctx)`** — Handles structural fragments, HTML fragments, and text coercion. Shared by both surfaces.
- **`unmountRegion(region)`** — Runs cleanup handles, removes DOM nodes.

Design constraints:
- The patch primitive takes a `ctx` object with `{ parent, insertBefore, ownerDocument }`, making it agnostic to element vs comment-range mounting.
- Element-bound context: `parent = container`, `insertBefore = null`.
- Comment-range context: `parent = anchor.parentNode`, `insertBefore = endComment`.

### Runtime: Hydrate Refactor

#### [MODIFY] [hydrate.js](file:///Users/judahsullivan/Personal/zenithbuild-monorepo/packages/runtime/src/hydrate.js)

- Import the shared patch primitive from `fragment-patch.js`.
- **Replace `_mountStructuralFragment`** body: delegate to `createFragmentRegion()` + `update()` instead of `innerHTML = ''`. Keep the function signature for backward compatibility.
- **Replace `_mountStructuralFragmentIntoCommentRange`** body: delegate to the same shared patch primitive, passing comment-range context.
- Remove duplicated mounting logic (~120 lines eliminated from each function).
- **No functional change** to `_applyMarkerValue`, `_applyCommentMarkerValue`, or any other APIs. They remain the entry points, just delegating to the shared engine internally.

Net effect on `hydrate.js`: ~200-250 lines removed, bringing it closer to the 500-line target. (Still above — this file needs further refactoring in future tracks, but this change moves in the right direction.)

### Runtime: Ref Ownership (Already Wired, Tests Added)

The ref lifecycle is already correctly implemented in `hydrate.js` (lines 101-122):
- `ref.current` is populated during hydration before component mount.
- A disposer clears all `ref.current = null` on cleanup.

What's missing: **mechanical lock tests** that prove the exact ownership invariants.

### Tests

#### [NEW] [fragment-patch.spec.js](file:///Users/judahsullivan/Personal/zenithbuild-monorepo/packages/runtime/tests/fragment-patch.spec.js)

Mechanical tests for the fragment patch loop:

1. ✅ No `innerHTML = ''` on update path (source scan).
2. ✅ Unchanged index preserves region — DOM nodes stay in place.
3. ✅ Changed index remounts only that region.
4. ✅ Trailing regions removed when shrinking `[A, B, C]` → `[A]`.
5. ✅ New regions appended when growing `[A]` → `[A, B, C]`.
6. ✅ Unaffected sibling DOM outside the fragment region remains intact.
7. ✅ `[A, B]` → `[B, A]` updates by index, not by move semantics.
8. ✅ Same-index same-value (`old[i] === new[i]`) skips remount.

#### [NEW] [ref-ownership.spec.js](file:///Users/judahsullivan/Personal/zenithbuild-monorepo/packages/runtime/tests/ref-ownership.spec.js)

Mechanical tests for ref lifecycle:

1. ✅ `ref.current` populated after `hydrate()`.
2. ✅ `ref.current` cleared to `null` after `cleanup()`.
3. ✅ Repeated `cleanup()` is safe (idempotent).
4. ✅ Multiple refs all cleared on single cleanup.
5. ✅ `ref.current` is set before `zenMount` callbacks run (already tested in integration, but add a dedicated lock test).

## Open Questions

> [!IMPORTANT]
> **File size tradeoff**: `hydrate.js` is currently 2125 lines. This extraction will reduce it by ~200-250 lines. Should we address the remaining oversize in this PR, or defer further splitting to a future track? My recommendation: defer — this track's scope is the patch loop + ref locks.

## Verification Plan

### Automated Tests
```bash
cd packages/runtime && npm run test
```
- All existing 15 test files must pass without modification.
- New `fragment-patch.spec.js` must pass all 8 mechanical locks.
- New `ref-ownership.spec.js` must pass all 5 mechanical locks.
- Source scan test: `hydrate.js` must not contain `innerHTML = ''` in the structural fragment update path.
