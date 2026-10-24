# Phase 15 Runtime Diagnostics & Error-String Compaction Tracker

## 1. Executive Summary

Phase 15 reduced emitted production runtime bytes by compacting:
- `diagnostics-production.js`
- shared runtime hint/error-string scaffolding across runtime modules

No framework feature surface changed. Runtime/server/public contract semantics remained unchanged.

## 2. Track Overview

- [x] **Track A: diagnostics/error-string audit** (Implemented)
- [x] **Track B: bounded compaction** (Implemented)
- [x] **Track C: determinism/parity/publication revalidation** (Implemented)

## 3. Implementation Summary

### Track A — Audit
Audited production runtime profile contributors with focus on:
- `diagnostics-production.js` sanitizer and payload scaffolding duplication
- repeated runtime hint/error strings in `render.js`, `events.js`, `scanner.js`, `hydrate.js`, `markup.js`, `expressions.js`

### Track B — Compaction
Implemented:
- compact validation maps and docs-link constants in `diagnostics-production.js`
- unified text sanitization helpers (`_compact`, `_sanitizeOptionalText`)
- consolidated absolute-path sanitization regex path
- reduced production no-op overlay scaffolding footprint
- shortened non-contract hint strings in runtime modules while preserving:
  - error codes
  - docs-link semantics
  - key runtime error messages used by tests (for example `innerHTML bindings are forbidden in Zenith`, `non-renderable object`)

### Track C — Revalidation
Validated:
- runtime tests: `npm --workspace packages/runtime test`
- bundler build/contracts:
  - `npm --workspace packages/bundler run build`
  - `npm --workspace packages/bundler run contract:deps`
  - `npm --workspace packages/bundler run contract:scan`
  - `npm --workspace packages/bundler run contract:imports`
- CLI build: `npm --workspace packages/cli run build`
- parity suites:
  - `packages/cli/tests/resource-streaming.spec.js`
  - `packages/cli/tests/adapter-hosted-resource-parity.spec.js`
  - `packages/cli/tests/adapter-platform-node-streaming.spec.js`
- publication determinism:
  - initial run showed baseline drift from intentional runtime asset changes
  - baselines refreshed with `--save-baseline`
  - post-refresh run passed determinism for all Zenith publication cases
- Zenith publication-profile matrix:
  - `apps/benchmarks/results/phase15-diag-compact-publication/matrix.json`
  - `publication_assessment.publicationStatus = "ready"`
- zero-JS static check:
  - `apps/benchmarks/results/phase15-zerojs-check/bundle-analysis.json` passed

## 4. Outcome Metrics (`interactive-filter`)

Locked baseline:
- runtime chunk: `104,452 B`
- total JS+inline: `172,203 B`

Final:
- runtime chunk: `103,537 B`
- total JS+inline: `171,288 B`

Delta:
- runtime chunk reduction: `-915 B`
- total interactive-route JS+inline reduction: `-915 B`

## 5. Updated Runtime Contributor Ranking (`interactive-filter`)

Top production-emitted runtime contributors:
1. `payload.js` — `13,771 B`
2. `hydrate.js` — `12,478 B`
3. `expressions.js` — `11,214 B`
4. `diagnostics-production.js` — `11,180 B`
5. `render.js` — `10,840 B`

## 6. Policy / Scope Locks Preserved

- no public API changes
- no server model changes
- no middleware/download scope changes
- zero-JS static omission preserved
- external-framework publication caveat policy unchanged
