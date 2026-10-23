# Phase 14 Runtime-Core Semantic Byte Pruning Tracker

## 1. Executive Summary

Phase 14 pruned semantic duplication in runtime-core with no public API changes and no server/runtime model changes.

Scope stayed constrained to:
- `payload.js` and `expressions.js` first
- bounded fallback micro-pass in `hydrate.js` / `render.js` only after under-target first pass
- mandatory determinism/parity/publication revalidation

## 2. Track Overview

- [x] **Track A: `payload.js` semantic pruning** (Implemented)
- [x] **Track B: `expressions.js` semantic pruning** (Implemented)
- [x] **Track C: full revalidation gates** (Implemented)
- [x] **Track D: fallback micro-pass (`hydrate.js` / `render.js`)** (Implemented, required)

## 3. Implementation Summary

### Track A — `payload.js`
Implemented:
- shared compact assertion helpers for repeated payload checks
- shared freeze-table helpers for descriptor/table freeze loops
- reduced duplicate descriptor checks in `_resolveComponentProps` while preserving runtime failure semantics
- preserved payload immutability and freeze guarantees

### Track B — `expressions.js`
Implemented:
- unified mode-aware expression value resolution (`state`, `signal`, component bindings)
- single binding-source resolution path for strict-member and not-lowered error handling
- deduped literal root resolution and error construction helpers
- retained error codes/docs-link semantics (`EXPRESSION_NOT_LOWERED`, `UNRESOLVED_EXPRESSION`, `UNSAFE_MEMBER_ACCESS`)

### Track C — Revalidation
Validated:
- runtime suite: `npm --workspace packages/runtime test`
- bundler contracts:
  - `npm --workspace packages/bundler run contract:deps`
  - `npm --workspace packages/bundler run contract:scan`
  - `npm --workspace packages/bundler run contract:imports`
- CLI parity suites:
  - `packages/cli/tests/resource-streaming.spec.js`
  - `packages/cli/tests/adapter-hosted-resource-parity.spec.js`
  - `packages/cli/tests/adapter-platform-node-streaming.spec.js`
- publication determinism (post-refresh): `phase14-semantic-prune-det-final2-postrefresh`
- publication matrix (Zenith, publication profile): `phase14-semantic-prune-publication-final2`
- zero-JS static invariant preserved (`static-marketing`)

### Track D — Conditional Fallback (`hydrate.js` / `render.js`)
Required because initial Track A+B pass underdelivered target.

Implemented:
- marker/subscription path dedupe in `hydrate.js`
- structural fragment mount/update dedupe and attribute-path compaction in `render.js`
- preserved raw HTML explicit-boundary behavior and guardrail assertions

## 4. Outcome Metrics (`interactive-filter`)

Locked baseline:
- runtime chunk: `112,531 B`
- total JS+inline: `180,282 B`

Final:
- runtime chunk: `104,452 B`
- total JS+inline: `172,203 B`

Delta:
- runtime chunk reduction: `-8,079 B`
- total interactive-route JS+inline reduction: `-8,079 B`

Gate result:
- Target `8–12 KB` reduction: **passed**

## 5. Final Runtime Contributor Ranking (`interactive-filter`)

Top runtime contributors (production-emitted profile):
1. `payload.js` — `13,771 B`
2. `hydrate.js` — `12,526 B`
3. `diagnostics-production.js` — `11,786 B`
4. `expressions.js` — `11,227 B`
5. `render.js` — `10,957 B`

## 6. Determinism/Baseline Notes

Zenith publication baselines were refreshed during Phase 14 due intentional deterministic emission changes:
- `content-index__zenith.json`
- `interactive-filter__zenith.json`
- `reactive-minimal__zenith.json`
- `static-marketing__zenith.json`

External-framework determinism publication policy remains unchanged:
- Zenith determinism = hard publication gate
- external framework determinism = caveat metadata only
