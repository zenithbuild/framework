# Phase 17 Expressions + Render Semantic Compaction Tracker

## 1. Executive Summary

Phase 17 reduced emitted production runtime bytes by compacting:
- `packages/runtime/src/expressions.js`
- `packages/runtime/src/render.js`

Scope stayed bounded to semantic consolidation only. No public API, route/server model, or feature-surface changes were introduced.

## 2. Track Status

- [x] **Track A: `expressions.js` semantic compaction** (Implemented)
- [x] **Track B: `render.js` semantic compaction** (Implemented)
- [x] **Track C: determinism/parity/publication revalidation** (Implemented)

## 3. Implementation Summary

### Track A — `expressions.js`
Implemented:
- consolidated repeated mode/value resolution into shared helper paths (`_rvm`, `_rcb`, `_rcr`)
- removed intermediate literal-scope object construction from strict member resolution
- resolved strict member-chain base values directly from canonical roots/state key index
- consolidated source-span detection path and duplicated `hasOwnProperty` scaffolding
- preserved expression resolution/error code/docs-link semantics

### Track B — `render.js`
Implemented:
- consolidated repeated text-marker path construction in `_applyMarkerValue`
- consolidated active fragment-region update checks through one helper path
- consolidated repeated “empty attribute value” logic used by class/style/general attr branches
- preserved render ordering, fragment update behavior, and runtime error semantics

## 4. Revalidation Summary

Validated:
- runtime: `npm --workspace packages/runtime test`
- bundler:
  - `npm --workspace packages/bundler run build`
  - `npm --workspace packages/bundler run contract:deps`
  - `npm --workspace packages/bundler run contract:scan`
  - `npm --workspace packages/bundler run contract:imports`
- CLI:
  - `npm --workspace packages/cli run build`
  - `npm --workspace packages/cli test -- tests/resource-streaming.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-platform-node-streaming.spec.js`
- determinism:
  - pre-refresh check (`phase17-expressions-render-det-check`) showed baseline drift only
  - baseline refresh (`phase17-det-refresh-zenith`) saved new Zenith publication baselines
  - post-refresh check (`phase17-expressions-render-det-postrefresh`) passed all Zenith cases with zero internal drift
- publication-profile matrix:
  - `apps/benchmarks/results/phase17-expressions-render-publication/matrix.json`
  - publication assessment `publicationStatus: "ready"`
- zero-JS static:
  - `apps/benchmarks/results/phase17-expressions-render-publication/bundle-analysis.json`
  - `static-marketing` remained `scripts: []`, `inlineScriptCount: 0`, `jsCount: 0`

## 5. Outcome Metrics (`interactive-filter`)

Locked baseline (post-Phase 16):
- runtime chunk: `100,770 B`
- total JS+inline: `168,521 B`

Phase 17 final:
- runtime chunk: `100,404 B`
- total JS+inline: `168,155 B`

Delta:
- runtime chunk reduction: `-366 B`
- total interactive-route JS+inline reduction: `-366 B`

## 6. Updated Breakdown (`interactive-filter`)

- runtime: `100,404 B`
- router: `34,787 B`
- page chunk: `32,568 B`
- core: `396 B`
- total JS+inline: `168,155 B`

## 7. Scope / Policy Locks Preserved

- no new public APIs
- no feature-surface expansion
- expression evaluation semantics preserved
- render output/order semantics preserved
- runtime error code/docs-link behavior preserved
- zero-JS static omission preserved
- determinism preserved (post-refresh)
- local/hosted streaming-resource parity preserved
- publication path remains valid
