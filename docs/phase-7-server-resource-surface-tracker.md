# Phase 7 Server Resource Surface Tracker

## 1. Executive Summary

Phase 7 continues Zenith's full-stack server surface by adding one truthful non-HTML response model on the existing route boundary.

This phase must not become a second backend framework. It should extend Zenith's current server-owned request, auth, and route-control contract with one explicit resource capability that works in dev, preview, and packaged node.

Phase 7 priorities:
- keep resource handling route-owned and explicit
- preserve existing `guard(ctx)` and `ctx.auth` truth
- keep page HTML routes and resource routes clearly separated
- ship one narrow non-HTML response model first
- keep RPC, REST-framework sprawl, streaming, and binary/media scope out unless intentionally promoted later

## 2. Track Overview

- **Track A** — Canonical Resource Route Surface (Complete)
- **Track B** — Download/File Response Support (Complete)
- **Track C** — Reserved

## 3. Active Item

### Phase 7 Track B — Download/File Response Support
**Status:** Complete

**Goal:** Add one explicit attachment-style `download(...)` helper to dedicated resource routes without widening Zenith into a generic binary, streaming, or media platform.

**Shipped scope:**
- resource-only `download(body, { filename, contentType? })`
- fixed `Content-Disposition: attachment`
- fixed `200` status and a 5 MiB payload cap
- support for `string`, `Uint8Array`, `ArrayBuffer`, and `Buffer`-compatible bytes
- auth, cookie staging, redirects, deny behavior, and multipart parity across dev / preview / packaged node
- no router HTML soft-nav or `data-zen-form` behavior changes

**Guardrails:**
- no generic RPC framework
- no REST-framework sprawl
- no arbitrary `Response` return surface
- no `file(...)` helper or inline serving
- no streaming platform
- no range-request or media platform expansion
- no hosted-target expansion beyond current direct server paths

## 4. Risks

- **Route-model drift:** resource routes could blur into page-route semantics or a second backend stack.
  **Mitigation:** use one explicit route kind and keep page HTML semantics unchanged.
- **Router dishonesty:** client navigation or enhanced forms could incorrectly treat non-HTML responses as HTML routes.
  **Mitigation:** make resource-route behavior explicit in manifests/templates and fail closed.
- **Header/body scope creep:** a narrow response model could balloon into arbitrary header, binary, or streaming support.
  **Mitigation:** keep the first milestone limited to a minimal response-kind set with explicit non-goals.

## 5. Exit Criteria

- [x] One explicit non-HTML server route surface is defined and implemented.
- [x] The first milestone keeps page HTML routes and resource routes clearly separated.
- [x] Dev, preview, and packaged node agree on resource-route request/response behavior.
- [x] Auth, cookies, guard control flow, and multipart parsing remain truthful on the new surface.
- [x] Docs and tests keep explicit non-goals: no RPC framework, no broad REST platform, no streaming/binary platform in the first slice.

## 6. Completed Notes

Track A shipped one explicit resource route kind on Zenith's existing server model:
- page routes remain HTML-only and keep `data(...)` / `invalid(...)`
- resource routes remain non-HTML and use `json(...)` / `text(...)`
- resource routes preserve `guard(ctx)`, `ctx.auth`, multipart parsing, redirects, deny, and staged cookie behavior
- resource routes are excluded from client HTML routing/enhancement semantics

Still deferred after this milestone:
- `file(...)` / inline serving
- large binary or media bodies beyond the capped attachment helper
- streaming / SSE
- range requests
- filesystem-path public helpers
- generic RPC or REST-platform expansion
- hosted-target support beyond the currently supported local dev / preview / packaged node paths
