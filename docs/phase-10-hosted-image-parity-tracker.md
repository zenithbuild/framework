# Phase 10 Hosted Image Parity Tracker

## 1. Executive Summary

Phase 10 should carry Zenith's existing `/_zenith/image` runtime endpoint into the supported hosted adapters without changing the image contract.

This phase must stay narrow:
- keep packaged node image runtime behavior as the source of truth
- map the existing endpoint into hosted targets without reinterpreting route meaning
- preserve the current no-page-asset, no-dynamic-eval image contract
- avoid widening into a CDN, storage, or media platform

## 2. Track Overview

- **Track A** — Hosted Image Endpoint Parity (Complete)
- **Track B** — Reserved
- **Track C** — Reserved

## 3. Completed Item

### Phase 10 Track A — Hosted Image Endpoint Parity
**Status:** Complete

**Goal:** Carry Zenith's existing `/_zenith/image` runtime endpoint into `vercel` and `netlify` without changing the image contract.

**Guardrails:**
- no image contract changes
- no page-asset execution
- no dynamic-eval backsliding
- no CDN/media/storage platform expansion
- no new image API surface
- hosted adapters only map existing packaged runtime behavior into host layouts

**Delivered scope:**
- hosted `vercel` and `netlify` now wire the existing `/_zenith/image` runtime endpoint
- hosted endpoint responses preserve packaged node semantics for `400 missing_url`, successful binary bodies, `Content-Type`, and `Cache-Control`
- hosted adapters continue to preserve existing `/_zenith/image/local/*` static asset routing unchanged
- no image contract widening, no page-asset execution, and no hosted media-platform expansion were introduced

## 4. Risks

- **Hosted/runtime drift:** hosted image behavior could diverge from packaged node semantics.
  **Mitigation:** use packaged node runtime as the only behavioral truth and prove hosted parity with adapter tests.
- **Media-platform creep:** a hosted image milestone could turn into broader asset or storage scope.
  **Mitigation:** keep the first milestone limited to the existing image endpoint only.
- **Dishonest claims:** docs could imply hosted image support before endpoint wiring, headers, and binary responses are proven.
  **Mitigation:** update deployment docs only after hosted image tests pass.

## 5. Exit Criteria

- [x] Hosted `vercel` and `netlify` expose the existing `/_zenith/image` runtime endpoint.
- [x] Hosted image requests preserve packaged node response semantics for status, content type, and cache headers.
- [x] The milestone does not widen image API scope or execute page assets.
- [x] Deployment docs distinguish shipped hosted image support from deferred media/platform work.
