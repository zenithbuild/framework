# Phase 11 Resource DX Alias + Middleware Composition Tracker

## 1. Executive Summary

Phase 11 improves the non-HTML server developer experience without changing Zenith's architecture. It adds a preferred `src/api/**` discovery convention for `src` layout projects and introduces explicit `withMiddleware(...)` composition for server handlers.

This phase keeps Zenith on one server model: resource routes remain the only non-HTML route kind.

## 2. Track Overview

- [ ] **Track A: `src/api/**` DX Alias Discovery**
- [ ] **Track B: Explicit Middleware Composition (`withMiddleware`)**
- [ ] **Track C: Docs, Diagnostics, and Parity Validation**

## 3. Active Scope

### Track A — `src/api/**` DX Alias Discovery
**Goal**: Discover resource routes from `src/api/**` when `pagesDir` resolves under a `src` layout.

**Rules**:
- Alias discovery is additive to existing `pagesDir` resource discovery.
- Alias discovery compiles to existing resource-route semantics only.
- Route collisions fail fast with diagnostics; no precedence fallback.

**Exit Criteria**:
- [ ] `src/api/**/*.resource.*` maps to `/api/**` using existing segment rules.
- [ ] Existing `pagesDir` resource discovery remains intact.
- [ ] Collision tests enforce fail-fast duplicate route diagnostics.

### Track B — Explicit Middleware Composition
**Goal**: Add `withMiddleware(handler, ...middleware)` as explicit server-only composition.

**Rules**:
- `withMiddleware(handler, a, b) === a(b(handler))`.
- Middleware is route-level and explicit.
- Middleware may return only valid route results for the wrapped handler kind, throw, or call wrapped handler.
- No global middleware file, no inherited middleware, no hidden wrapping.

**Exit Criteria**:
- [ ] `withMiddleware` exported from `zenith:server-contract`.
- [ ] Guard/load/action/resource behavior tests cover pass-through and short-circuit.
- [ ] Server-only boundary test confirms helper is not a client/runtime route-surface import.

### Track C — Docs + Parity Validation
**Goal**: Keep contract docs and parity tests aligned with the new bounded surface.

**Rules**:
- `src/api/**` is documented as preferred for `src` layout projects.
- Middleware docs explicitly define composition order and non-goals.
- No runtime/router/server-output architecture refactor in this phase.

**Exit Criteria**:
- [ ] Reference/contract docs updated.
- [ ] Local + hosted resource parity tests remain green.
- [ ] Streaming/SSE regressions remain green.

## 4. Explicit Non-Goals

- No second non-HTML server model.
- No global root `middleware.ts`.
- No folder-inherited middleware semantics.
- No `req/res/next` public middleware model.
- No generic response interceptor or arbitrary header mutation surface.
- No server-output structural refactor.
