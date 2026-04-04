# Phase 9 Hosted Deployment Parity Tracker

## 1. Executive Summary

Phase 9 should carry Zenith's already-shipped local server capabilities into the supported hosted adapters without changing the core server contract.

This phase must stay adapter-parity-focused. It should not reopen resource-route design, add a new platform abstraction, or widen Zenith into a hosted backend framework. The Node/server contract remains the source of truth; hosted targets should consume the same packaged server surface honestly.

Phase 9 priorities:
- restore truthful hosted server runtime packaging first
- preserve Node as the canonical server contract
- bring hosted adapter behavior into parity without changing route semantics
- keep auth, cookies, multipart, resource routes, and downloads explicit and testable
- defer broader platform/storage/media scope

## 2. Track Overview

- [x] Track A: Hosted Page Route Parity (Established)
- [x] Track B: Hosted Resource Route Core Parity (Established)
- [x] Track C: Hosted Multipart Resource Write Parity (Established)
- [ ] Track D: Hosted Download Support (Deferred)

## 3. Completed Item

### Phase 9 Track A — Hosted Page-Route Runtime Packaging & Cookie Session Parity
**Status:** Complete

**Goal:** Restore truthful hosted server runtime packaging for Vercel and Netlify, then carry page-route cookie-session behavior into those adapters without changing Zenith's core route contract.

**Why first:**
- hosted function bundles now include the shared page-route runtime dependencies required by the shared route renderer
- hosted adapter tests now prove packaged page-route execution again
- page-route auth parity is now proven for redirect and `Set-Cookie` behavior on hosted page routes without widening hosted scope

**Guardrails:**
- no new auth contract
- no provider or OAuth scope
- no resource-route widening in this first milestone
- no adapter-owned reinterpretation of route meaning
- no hosted-only server model

## 4. Risks

- **Adapter drift:** hosted targets could silently diverge from packaged Node behavior.
  **Mitigation:** use Node/server output as the only truth source and add parity tests against hosted function output.
- **Scope creep:** hosted parity work could pull resource routes, downloads, and multipart in too early.
  **Mitigation:** keep the first milestone limited to hosted page-route runtime packaging and cookie-session parity.
- **Dishonest support claims:** docs could imply hosted support before tests prove it.
  **Mitigation:** update the deployment matrix only when hosted tests pass for the claimed surface.

## 5. Exit Criteria

- [x] Hosted server function bundles include the full runtime dependency set required by the shared route renderer.
- [x] Vercel and Netlify packaged page routes execute successfully again.
- [x] Route-owned cookie sessions work on hosted page routes with redirect and `Set-Cookie` parity.
- [x] Deployment docs clearly distinguish supported hosted behavior from still-deferred local-only capabilities.

## 6. Completed Item

### Phase 9 Track B — Hosted Resource Route Parity
**Status:** Complete

**Goal:** Carry Zenith's already-shipped hosted runtime base forward to one truthful hosted resource-route slice without changing the server contract.

**Why next:**
- hosted adapters now dispatch hosted functions by packaged `route_kind`
- hosted `json(...)` and `text(...)` resource routes now execute on Vercel and Netlify using the same packaged runtime surface as `node`
- hosted tests now prove redirect, deny, auth, and staged-cookie parity on the supported hosted resource slice

**Guardrails:**
- no server contract changes
- no hosted downloads in this milestone
- no hosted route-check promotion
- no adapter-owned reinterpretation of route meaning

**Delivered scope:**
- hosted resource-route packaging and dispatch for `json(...)` and `text(...)`
- hosted `redirect(...)` and `deny(...)` on resource routes
- hosted auth and staged-cookie parity on supported resource responses
- explicit deferral remains in place for hosted `download(...)`

### Track C: Hosted Multipart Resource Write Parity
**Status: Established**
- [x] Remove `isMultipartFormData` runtime block in Vercel adapter
- [x] Remove `isMultipartFormData` runtime block in Netlify adapter
- [x] Extend core server contract to allow `invalid` on resource routes
- [x] Update resource response descriptor for `invalid -> json` mapping
- [x] Verify multipart success (fields + files) in hosted parity tests
- [x] Verify multipart negative path (`invalid()`) in hosted parity tests
- [x] Verify multipart auth roundtrip in hosted parity tests
- [x] Update deployment documentation for multipart status and body limits
