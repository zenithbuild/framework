# Phase 12 Performance Credibility + Interactive JS Reduction Tracker

## 1. Executive Summary

Phase 12 hardens Zenith benchmark trustworthiness and reduces visible interactive-route JS weight without adding new framework surface area.

This phase is intentionally constrained:
- no new runtime feature model
- no hosted `download(...)` work
- no middleware expansion
- no server-output architecture redesign

## 2. Track Overview

- [x] **Track A: Benchmark Credibility Hardening** (Implemented)
- [x] **Track B: Client Emission Correctness** (Implemented)
- [x] **Track C: Interactive JS Reduction** (Implemented)
- [x] **Track D: Publication Rerun Readiness Gate** (Policy adopted; rerun workflow active)

## 3. Active Scope

### Track A — Benchmark Credibility Hardening
**Goal**: Stop treating incomplete/errored categories as validated and tighten comparability reporting.

**Implemented**:
- Matrix aggregation now fails when runner output is invalid, empty, timed out, or non-passed.
- Hydration runner fails on HTTP error status, page errors, and browser console errors.
- Reactive-update runner fails on build failure and zero-result output.
- Bundle-analysis output now includes inline script bytes and combined JS+inline totals.
- Comparative renderer includes explicit inline-script comparability caveat text.

**Exit Criteria**:
- [x] Empty result categories fail.
- [x] Timeouts fail.
- [x] Hydration/runtime browser errors fail.
- [x] Incomplete categories cannot be interpreted as validated.
- [x] Inline script accounting is visible in benchmark output.

### Track B — Client Emission Correctness
**Goal**: Eliminate invalid client JS emission for interactive fixtures.

**Implemented**:
- Hoisted/module/component-script payload normalization now transpiles TS syntax to JS before emission in ESNext mode.
- Emission path wiring updated so normalization has source-file identity + transform cache context.

**Exit Criteria**:
- [x] `interactive-filter` emitted client bundles parse as valid JS.
- [x] Hydration benchmark for `interactive-filter` runs cleanly.
- [x] No contract-surface changes were required.

### Track C — Interactive JS Reduction
**Goal**: Ship bounded, deterministic JS reductions for interactive routes.

**Implemented**:
- Deterministic scoped identifier compaction in compiler script slug sanitization.
- Router template supports minimal optional form-enhancement gating (`formsEnabled`) based on manifest/build signal.

**Current Evidence (`interactive-filter`, Zenith fixture)**:
- Total emitted JS: `199.37 KB` (4 files)
- Largest contributors:
  - runtime: `136,447 B`
  - router: `34,787 B`
  - page chunk: `32,568 B`
  - core shim: `396 B`

**Exit Criteria**:
- [x] Deterministic compaction implemented.
- [x] Optional form subsystem gating implemented.
- [x] Router template contract fixtures updated and passing.

### Track D — Publication Rerun Readiness Gate
**Goal**: Define policy-based go/no-go before publication-profile market rerun.

**Adopted Policy**:
- Zenith determinism is a hard publication gate.
- External framework determinism is recorded as metadata/caveat and is not a hard publication blocker.
- Runtime/hydration errors, timeout failures, and empty outputs remain hard blockers.

**Go Conditions**:
- [x] Round 1 publication policy explicitly encoded in benchmark artifacts.
- [ ] Round 1 publication-profile matrix completes for Zenith with all hard gates passing.
- [ ] No empty category outputs.
- [ ] No hydration/runtime failures across published comparisons.
- [ ] Bundle-analysis comparability notes included in rendered report.
- [ ] Interactive-route JS reduction delta captured in report artifacts.

**No-Go Triggers**:
- [ ] Any failed/invalid Zenith hard-gate track.
- [ ] Any category omitted but reported as comparative evidence.
- [ ] Any runtime parse/hydration error in published rows.

## 4. Mechanical Locks (Non-Negotiable)

- No new framework feature surface in Phase 12.
- No hosted `download(...)` scope in Phase 12.
- No middleware/model expansion.
- No benchmark Round 2 scope.
- No broad server-output refactor unless required for correctness.
- Keep reductions deterministic and benchmark-comparable.

## 5. Follow-On Candidates (After Phase 12 Gate)

1. Runtime/core byte-reduction pass (highest remaining JS contributor).
2. Additional router subsystem gating only when tied to explicit manifest/build signals.
3. Publication-profile rerun + report freeze once Track D go conditions are satisfied.
