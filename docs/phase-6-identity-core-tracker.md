# Phase 6 Identity Core Tracker

## 1. Executive Summary

Phase 6 resumes forward product motion by turning Zenith's already-advertised `ctx.auth` route context into one truthful, narrow identity capability: route-owned cookie sessions.

This phase does not introduce a second server model. It builds directly on the existing `guard(ctx) -> action(ctx) -> load(ctx)` route contract and keeps ordinary HTML forms, redirects, and same-route HTML responses first-class.

Phase 6 priorities:
- keep auth server-owned and route-owned
- make the existing `ctx.auth` surface truthful
- preserve explicit request/response trust boundaries
- keep parity across dev, preview, and packaged node
- keep providers, OAuth, RBAC, and storage-platform scope out of this milestone

## 2. Track Overview

- **Track A** — Route-Owned Cookie Sessions (Complete)
- **Track B** — Reserved
- **Track C** — Reserved

## 3. Active Item

### Phase 6 Track A — Route-Owned Cookie Sessions
**Status:** Complete

**Goal:** Replace the currently stubbed `ctx.auth` surface with one truthful, cookie-backed session workflow usable from `guard(ctx)`, `action(ctx)`, and `load(ctx)`.

**Audit direction:**
- confirm the currently advertised `ctx.auth` contract versus real runtime behavior
- identify the smallest truthful session read / require / sign-in / sign-out API
- preserve HTML forms and redirects as the primary interaction model
- avoid widening into a generic auth or identity platform

**Guardrails:**
- no OAuth or provider abstraction
- no social login
- no RBAC or policy framework
- no generic auth service
- no multi-tenant identity platform
- no token/JWT platform expansion unless strictly required by the chosen cookie contract

## 4. Risks

- **Auth scope creep:** route-owned sessions could drift into a broader identity or provider system.
  **Mitigation:** keep the milestone limited to one cookie-backed session contract on `ctx.auth`.
- **Dishonest contract surface:** types or docs could promise session features before parity exists.
  **Mitigation:** land docs, tests, and runtime behavior together; fail explicitly on unsupported paths.
- **Trust-boundary erosion:** session handling could weaken the hard request/response rules from earlier phases.
  **Mitigation:** preserve server authority, same-origin HTML flows, and explicit cookie mutation rules.

## 5. Exit Criteria

- [x] `ctx.auth` is truthful in dev, preview, and packaged node.
- [x] One canonical server-owned cookie-session workflow exists for session read, require, sign-in, and sign-out.
- [x] Ordinary HTML forms and redirects remain first-class for auth flows.
- [x] Tests lock request/response parity and explicit failure semantics.
- [x] Docs and contracts state explicit non-goals: no providers, no OAuth platform, no RBAC framework, no generic auth service.
