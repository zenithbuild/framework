# Phase 10 Streaming / SSE Tracker

## 1. Executive Summary

Phase 10 introduces first-class support for streaming and Server-Sent Events (SSE) to Zenith resource routes. This moves Zenith beyond discrete request/response cycles by leveraging standard Web Fetch `ReadableStream` and `AsyncIterable` primitives.

This phase maintains Zenith's strict separation between Page Routes and Resource Routes. Streaming is only supported on dedicated resource routes.

## 2. Track Overview

- [x] **Track A: Resource Streaming & SSE** (Complete)
- [ ] **Track B: Markdown Streaming (Reserved)**
- [ ] **Track C: Edge Optimization (Reserved)**

## 3. Active Item

### Phase 10 Track A — Resource Streaming & SSE
**Status: Complete**

**Goal**: Support `stream()` and `sse()` result helpers in resource routes with 100% parity across `node`, `vercel`, and `netlify`.

**Guardrails**:
- No arbitrary `Response` returns.
- No arbitrary header injection.
- No page-route streaming.
- No heartbeats or transform layers in v1.
- No WebSockets or background job abstractions.

**Delivered Contract**:
- `stream(body, { status?, contentType? })`
- `sse(events)`
- Resource-route only
- Standalone helpers imported from `zenith:server-contract`
- No `ctx.stream(...)` / `ctx.sse(...)`

**Exit Criteria**:
- [x] `stream` and `sse` helpers added to `server-contract.js`.
- [x] SSE message formatting correctly implemented in `resource-response.js`.
- [x] Node-runtime response delivery handles `ReadableStream`.
- [x] Parity tests verify streaming chunks on hosted targets.
- [x] Documentation updated to reflect the new surface.

**Implementation Notes**:
- Core server output remains `server/routes/<name>/route/entry.js`.
- `zenith:server-contract` relative import rewriting remains correct in emitted route modules.
- Hosted parity was restored by preserving route bundle nesting in the Vercel adapter.
- No structural server-output refactor was required for Track A.

## 4. Risks

- **Platform Buffering**: Some hosted platforms or proxies may buffer response chunks. Mitigation: Use standard `fetch`-compatible `Response` and document platform-specific behavior.
- **Contract Drift**: Adding streaming could invite requests for generic `Response` support. Mitigation: Keep the helpers narrow and standalone.
- **Resource Misuse**: Users may try to stream into `.zen` page routes. Mitigation: Enforce strict runtime validation and failure diagnostics.
