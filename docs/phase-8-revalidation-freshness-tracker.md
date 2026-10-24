# Phase 8 Revalidation & Freshness Tracker

## 1. Executive Summary

Phase 8 should give Zenith one truthful freshness model for its existing full-stack surface.

This phase must not become a generic query client, cache framework, background sync system, or second server model. It should connect the capabilities already shipped in page routes, route-owned mutations, cookie sessions, and dedicated resource routes with one explicit way to ask for a fresh HTML route evaluation when the app has stepped outside the automatic page-route flow.

Phase 8 priorities:
- keep freshness route-owned and explicit
- preserve page HTML flows, forms, and redirects as first-class
- preserve the explicit separation between page routes and resource routes
- avoid broad cache invalidation or optimistic client state machinery
- keep parity across dev, preview, and packaged node

## 2. Track Overview

- **Track A** — Route-Owned Revalidation and Freshness Contract (Complete)
- **Track B** — Reserved
- **Track C** — Reserved

## 3. Active Item

### Phase 8 Track A — Route-Owned Revalidation and Freshness Contract
**Status:** Complete

**Goal:** Ship one truthful freshness model that connects:
- page navigation
- page-route `action(ctx)`
- redirects
- resource-route writes
- auth/session changes

without widening Zenith into a generic client data platform.

**Delivered public contract:**
- router-side `await refreshCurrentRoute()`

**Delivered semantics:**
- re-fetches the current matched Zenith page route as fresh HTML
- reruns `guard(ctx)` and `load(ctx)` through the normal page-route boundary
- reuses the existing soft-navigation commit path and lifecycle
- does not push a new history entry
- preserves current redirect and deny behavior
- stays current-page-only with no path argument, tags, or cache semantics

**Clarified boundaries:**
- page-route HTML flows stay automatically fresh
- page `action(ctx)` stays automatically fresh
- resource routes remain explicit/direct and do not auto-refresh pages
- app code may call `refreshCurrentRoute()` after resource writes or resource-route auth changes when current-page HTML needs fresh server truth

**Guardrails:**
- no generic query/cache framework
- no background sync
- no optimistic cache machinery
- no second server model
- no implicit resource-route HTML behavior
- no contract drift between page routes, resource routes, router lifecycle, and docs

## 4. Risks

- **Client-data drift:** a freshness helper could widen into a cache/query platform.
  **Mitigation:** keep the first milestone limited to explicit current-route refresh semantics only.
- **Dishonest automation:** docs could imply that resource writes or auth changes automatically refresh unrelated page state when they do not.
  **Mitigation:** document exactly what is automatic today versus what remains explicit/manual.
- **Route-model erosion:** resource routes could become pseudo-page routes if freshness work blurs HTML and non-HTML ownership.
  **Mitigation:** keep HTML revalidation tied to the existing page-route render path, not to resource-route response kinds.

## 5. Exit Criteria

- [x] Zenith documents what is already automatic today for page routes, actions, redirects, auth changes, and resource requests.
- [x] One small public freshness contract is defined without introducing a cache/query framework.
- [x] The contract keeps page routes, resource routes, and router lifecycle responsibilities explicit.
- [x] Docs/tests state explicit non-goals: no background sync, no optimistic cache layer, no generic invalidation matrix.
