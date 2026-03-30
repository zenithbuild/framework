# Phase 4 Full-Stack Interaction Tracker

## 1. Executive Summary
Phase 4 resumes forward product motion after the Phase 0–3 closure work by extending Zenith's existing route-owned mutation contract into one additional real app capability: canonical multipart form uploads through `action(ctx)`.

This phase does not invent a second mutation surface. It builds directly on the shipped `guard(ctx) -> action(ctx) -> load(ctx)` contract and keeps uploads explicit, route-owned, progressively enhanced when safe, and direct-request compatible across dev, preview, and packaged node output.

Phase 4 priorities:
- keep uploads on the existing route-owned server boundary
- preserve progressive enhancement without promising a separate upload framework
- maintain parity across dev, preview, and packaged node
- keep validation and failure semantics explicit
- keep storage, CDN, resumable transfer, and background processing out of scope

## 2. Track Overview
- **Track A** — Route-Owned Multipart Uploads (Complete)
- **Track B** — Reserved
- **Track C** — Reserved

## 3. Active Item
### Phase 4 Track A — Route-Owned Multipart Uploads
**Status:** Complete

**Goal:** Support standard `multipart/form-data` submissions through the existing `action(ctx)` route boundary with one canonical read path for fields and files together.

**Guardrails:**
- no second mutation API
- no storage provider abstraction
- no resumable uploads
- no background jobs
- no generic file service or RPC surface
- no platform target expansion beyond direct-request parity in dev, preview, and packaged node

## 4. Completed Items
### Phase 4 Track A — Route-Owned Multipart Uploads
**Status:** Complete

**What shipped:**
- [x] `action(ctx)` continues to own the single canonical mutation boundary for form posts, including multipart uploads.
- [x] The public read path remains native `await ctx.request.formData()` with fields and files read from the same `FormData`.
- [x] Dev and preview isolated route execution now receive request bytes through a truthful stdin transport instead of env-var body injection.
- [x] Packaged node output preserves the same multipart route behavior.
- [x] Enhanced same-origin `data-zen-form` submissions no longer bail out on `multipart/form-data`; they stay on the same matched-route HTML round-trip.
- [x] Validation failures continue through `invalid(payload, 400|422)` and `ctx.action`.
- [x] JSON serialization guards still reject `File`, `FormData`, and other non-JSON return payloads.

**Next:** no additional Phase 4 slice has been approved yet. Future work should remain route-owned and avoid widening uploads into a storage or background-processing platform without a separate milestone decision.

## 5. Risks
- **Contract widening:** uploads could drift into a second mutation or storage surface.  
  **Mitigation:** keep the public API on native `ctx.request.formData()` inside `action(ctx)` only.
- **Dishonest dev/preview parity:** current isolated server execution transports request bodies through an environment variable, which is not a truthful general upload path.  
  **Mitigation:** move request-body transport for isolated execution to a real byte channel before claiming multipart support.
- **Enhancement drift:** router enhancement could diverge from direct browser form behavior.  
  **Mitigation:** keep native form submission first and ensure enhanced multipart uses the same same-origin HTML route path and response semantics.

## 6. Exit Criteria
- [x] `multipart/form-data` works through the existing `action(ctx)` path in dev, preview, and packaged node output.
- [x] Route authors use one canonical read path for fields + files together.
- [x] Enhanced same-origin `data-zen-form` POST submissions support multipart without inventing a separate client upload protocol.
- [x] Validation failures still use `invalid(payload, 400|422)` and route re-rendering through `ctx.action`.
- [x] Docs/contracts/tests state explicit non-goals: no storage abstraction, no resumable uploads, no generic file service.
