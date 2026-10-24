# Phase 5 Asset Pipeline Continuation Tracker

## 1. Executive Summary
Phase 5 resumes the deferred asset-pipeline continuation from Phase 2 Track B. The goal is not to widen Zenith into a broad media platform. The goal is to move one remaining image/final-materialization seam out of CLI-owned post-build mutation and into compiler/bundler-owned truth.

This phase stays narrow:
- one meaningful asset/materialization step
- compiler/bundler truth first
- explicit static-safe behavior
- no CDN, storage, or platform-media expansion

## 2. Track Overview
- **Track A** — Bundler-Final Static HTML Image Materialization (Complete)
- **Track B** — Reserved
- **Track C** — Reserved

## 3. Active Item
### Phase 5 Track A — Bundler-Final Static HTML Image Materialization
**Status:** Complete

**Goal:** Move final build-time HTML image materialization for emitted static HTML into bundler-owned truth, while preserving the existing compiler-owned `image_materialization` artifact and keeping runtime/server materialization behavior unchanged for this milestone.

**Guardrails:**
- no dynamic evaluation
- no page-asset execution to recover image props
- no CDN or storage integrations
- no dynamic image-props expansion
- no broad asset-pipeline rewrite
- no runtime/server ownership shift beyond what this milestone strictly requires

**Outcome:**
- bundler now consumes the compiler-owned `image_materialization` artifact plus one normalized image runtime payload when emitting final build/static HTML
- CLI build no longer performs post-bundler HTML image materialization for build/static output
- preview, dev, and packaged node runtime image materialization remain unchanged and explicitly deferred
- trust-boundary tests now lock the split truthfully

**Next:** no additional Phase 5 slice has been approved yet. Future asset work should stay artifact-driven and avoid widening into platform/media scope without a separate milestone decision.

## 4. Completed Items
### Phase 5 Track A — Bundler-Final Static HTML Image Materialization
**Status:** Complete

**What shipped:**
- [x] Bundler accepts one structured `image_runtime_payload` alongside the existing route envelope batch.
- [x] Bundler applies compiler-owned `image_materialization` entries when emitting final build/static HTML and fails explicitly on unresolved image markers.
- [x] CLI build stages image artifacts for payload truth, passes the normalized payload into bundler, and stops performing post-bundler HTML image materialization for build/static output.
- [x] Preview, dev, and packaged node runtime image materialization paths remain unchanged.
- [x] Bundler tests, CLI trust-boundary tests, and contract docs now describe the build/runtime split truthfully.

## 5. Risks
- **Ownership overreach:** this milestone could sprawl into dev/preview/server runtime materialization or broader image features.  
  **Mitigation:** only move final emitted static HTML materialization into bundler-owned output truth.
- **Contract drift:** docs/tests may continue to imply CLI build ownership after the seam moves.  
  **Mitigation:** update contract docs and trust-boundary tests in the same milestone.
- **Static/runtime confusion:** build-time materialization and runtime materialization could become conflated.  
  **Mitigation:** keep build/static ownership explicit and leave runtime paths unchanged/deferred.

## 6. Exit Criteria
- [x] Bundler consumes compiler-owned `image_materialization` entries when emitting final build HTML.
- [x] CLI no longer performs post-bundler final HTML image materialization for build/static output.
- [x] Dev, preview, and packaged node runtime image materialization remain unchanged and explicitly documented as deferred.
- [x] Tests prove final emitted HTML is materialized from structured artifacts without page-asset execution or dynamic evaluation.
- [x] Docs describe the narrowed ownership truth and preserve explicit non-goals.
