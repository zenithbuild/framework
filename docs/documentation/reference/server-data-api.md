---
title: "Server Data API"
description: "Public `<script server>` API for data, load context, and serialization requirements."
version: "0.5"
status: "canonical"
last_updated: "2026-05-25"
tags: ["reference", "server", "data"]
section: "Server and Data"
sectionOrder: 4
order: 2
---

# Server Data API

## Contract: Export Surface

Contract: Zenith exposes two explicit server route surfaces:
- page routes in `.zen` files
- dedicated resource routes in `*.resource.ts` or `page.resource.ts` (for `src/` layout projects, prefer `src/api/**`)

Invariant: A page route uses exactly one payload source (`data` or `load`). A resource route uses `load(ctx)` for `GET` / `HEAD` and `action(ctx)` for `POST`. Both route kinds share the same `ctx`, `guard(ctx)`, auth, cookie, and request boundaries.

Component Server Values are separate from route payload ownership. Layouts and components may declare owner-local server values with `<script server lang="ts">`, but they do not gain route `guard(ctx)`, `action(ctx)`, `load(ctx)`, redirect, deny, or resource response powers. See [Component Server Values](/docs/components/component-server-values).

Banned:
- Mixed payload source exports.
- `guard(ctx)` returning `data(...)`.
- `action(ctx)` returning undeclared ad hoc transport objects instead of the route-kind-specific result helpers.
- Non-contract server exports used as page payload channels.

Definition of Done:
- Export combinations pass server contract validation.
- `guard(ctx)`, `action(ctx)`, and `load(ctx)` each accept exactly one `ctx` argument.
- `action(ctx)` reads standard form submissions through `await ctx.request.formData()` when form data is needed.
- `prerender` is boolean when present.
- `exportPaths` is a literal array of concrete pathnames when present, and it remains part of the `static-export` concrete prerender contract.

Failure Modes:
- Invalid export sets create ambiguous payload ownership.
- Unsupported export names bypass validation.
- `exportPaths` drifts into runtime behavior instead of remaining the `static-export` concrete export contract.
- Mutation failures escape the route lifecycle instead of re-rendering the route with `ctx.action`.

Evidence:
- Server export validation tests enforce allowed combinations.

## Component Server Values

Component Server Values use the same server-only authoring block in layout and component owners, but they are not page `load(ctx)` and are not component loaders.

Supported owner-local forms:
- Level 1 top-level server constants used by the same owner template.
- Level 2 `export const data = async (ctx, props) => ({ ... })` for owner-local data that needs `ctx` or static literal props.

The public feature name is Component Server Values. The internal payload and manifest mechanism is Scoped Server Data.

### Page Route Results

Page routes keep the HTML surface:
- `data(payload)`
- `invalid(payload, 400|422)`
- `redirect(...)`
- `deny(...)`

### Resource Route Results

Dedicated resource routes keep the non-HTML surface:
- `json(payload, status = 200)`
- `text(body, status = 200)`
- `download(body, { filename, contentType? })`
- `stream(body, { status?, contentType? })`
- `sse(events)`
- `redirect(...)`
- `deny(...)`

Resource routes do **not** support `data(...)` or `invalid(...)`.
Page routes do **not** support `json(...)`, `text(...)`, `download(...)`, `stream(...)`, or `sse(...)`.

SSE event metadata is intentionally narrow: optional `event` and `id` fields must be single-line metadata values, and optional `retry` must be a non-negative safe integer. Multiline `data` remains supported and is framed as one `data:` line per input line.

## Contract: Explicit Middleware Composition

Contract: server middleware has a root global surface and an explicit route-local composition helper.

Invariant:
- root global middleware V1 is TypeScript-only and is discovered only from `middleware.ts` or `middleware/index.ts` at the directory that contains `pagesDir`
- root global middleware receives `(ctx, next)` and runs before matched route `guard(ctx)`, `action(ctx)`, and `load(ctx)`
- middleware is composed directly inside route exports via `withMiddleware(handler, ...middleware)`
- composition order is deterministic: `withMiddleware(handler, a, b)` means `a(b(handler))`
- route-local `withMiddleware(...)` only runs where route exports use it

Definition of Done:
- root global middleware may return `next()`, `ctx.redirect(...)`, or `ctx.deny(...)`
- root global middleware may use `ctx.auth.requireSession({ redirectTo })`, `ctx.auth.requireSession({ deny: 401|403|404, message? })`, `ctx.auth.signIn(...)`, and `ctx.auth.signOut()`
- root global middleware rejects `ctx.allow(...)`, `ctx.data(...)`, `ctx.invalid(...)`, `ctx.json(...)`, `ctx.text(...)`, `ctx.download(...)`, arbitrary `Response`, and plain objects
- route-local middleware may return any valid result for the wrapped handler kind, throw, or call the wrapped handler
- route handlers stay the canonical owner of behavior (`guard`, `load`, `action`, resource handlers)

Failure Modes:
- user-authored `middleware.js`, `middleware/index.js`, `middleware.tsx`, `middleware.mts`, or `middleware.cts` is implied as supported
- filesystem inheritance or automatic wrapping is implied
- middleware is presented as generic backend `req/res/next` framework semantics or as an arbitrary header/Response API

## Contract: Action Form Data

Contract: route-owned form mutations read request fields and uploaded files through native `await ctx.request.formData()` inside `action(ctx)`.

Invariant: standard `application/x-www-form-urlencoded` and `multipart/form-data` posts use the same canonical request path.

Banned:
- introducing `ctx.upload`, `ctx.files`, or a second mutation helper
- returning `File`, `FormData`, or other non-JSON values from `data(...)` or `invalid(...)`
- treating multipart uploads as a separate RPC or storage service surface

Definition of Done:
- fields and files are read together from the same `FormData` object
- validation failures still return `invalid(payload, 400|422)`
- enhanced same-origin form posts return the same matched route HTML response

Failure Modes:
- multipart support exists only on one server path
- file values leak into serialized route payloads
- client enhancement invents a second upload protocol

Evidence:
- dev, preview, and packaged-node route tests cover one multipart action flow with both fields and files

## Contract: Resource Route Responses

Contract: dedicated resource routes are Zenith's first explicit non-HTML route surface.

Invariant: the public resource surface stays intentionally narrow. Resource responses are limited to JSON, plain text, `stream(...)`, `sse(...)`, and one attachment-style `download(...)` helper, plus the existing `redirect(...)` and `deny(...)` control results.

Banned:
- returning arbitrary `Response`
- `file(...)`, inline serving, page-route streaming, `Blob`, `File`, range requests, or filesystem-path helper APIs
- using `json(...)` with a non-JSON-safe top-level plain object
- treating resource routes as a generic RPC or REST framework surface

Definition of Done:
- `GET` and `HEAD` resource requests resolve through `load(ctx)`
- `POST` resource requests resolve through `action(ctx)`
- `json(payload, status?)` reuses Zenith's existing JSON serialization guard
- `text(body, status?)` accepts strings only
- `download(body, { filename, contentType? })` uses fixed `Content-Disposition: attachment`
- `stream(body, { status?, contentType? })` accepts only `ReadableStream` or `AsyncIterable`
- `sse(events)` accepts only `AsyncIterable` event sources and emits standard SSE framing
- `sse(events)` accepts optional single-line `event` / `id` metadata and non-negative integer `retry` metadata
- `download(...)` accepts only `string`, `Uint8Array`, `ArrayBuffer`, or `Buffer`-compatible bytes and enforces a 5 MiB payload cap
- `ctx.auth` and staged `Set-Cookie` behavior match page-route behavior

Failure Modes:
- router enhancement treats a resource route like a same-route HTML re-render target
- resource responses differ across dev, preview, and packaged node
- docs imply arbitrary `Response`, page-route streaming, range requests, or arbitrary headers before they exist

Evidence:
- parity tests cover GET JSON, POST JSON, plain text, attachment downloads, stream, SSE, auth/cookie staging, and multipart POST on dedicated resource routes

## Contract: Freshness Boundary

Contract: Zenith keeps freshness ownership explicit across page routes and resource routes.

Invariant:
- page-route HTML flows are already automatically fresh
- page `action(ctx)` already reruns `guard(ctx)` / `load(ctx)` through the matched HTML route
- resource routes remain direct request surfaces and do not automatically refresh page HTML

Definition of Done:
- docs state that resource writes and resource-route auth changes stay explicit/manual from a page-freshness perspective
- app code may call router-side `refreshCurrentRoute()` after a non-HTML interaction when the current page needs fresh HTML route truth
- no server-side invalidation graph, cache tags, or path matrices are implied

Failure Modes:
- docs imply that `json(...)`, `text(...)`, or `download(...)` automatically refresh the current page
- resource routes are described as if they participate in page-route HTML re-render semantics
- `refreshCurrentRoute()` is described as a cache framework primitive instead of a current-page bridge

## Contract: Load Context and Serialization

Contract: `load` accepts one argument (`ctx`) containing request URL, params, request object, route metadata, and action state.

Invariant: Returned payload is a JSON-safe top-level plain object.

Banned:
- Non-serializable payload members.
- `File`, `FormData`, or other Web upload values inside returned route payloads.
- Cyclic payload graphs.

Definition of Done:
- Payload serializes deterministically.
- Invalid payloads fail with explicit diagnostics.
- POST action requests expose `ctx.action` to `load(ctx)` as either `null`, `{ ok: true, status: 200, data }`, or `{ ok: false, status: 400|422, data }`.

Failure Modes:
- Silent coercion of unsupported payload values.
- Route metadata inconsistency between environments.

Evidence:
- Serialization and route parity checks pass for representative routes.

## Contract: Route-Owned Auth Session Surface

Contract: `ctx.auth` is the single cookie-session surface for `guard(ctx)`, `action(ctx)`, and `load(ctx)`.

Invariant: auth stays route-owned and explicit. Routes read session state through `getSession()` / `requireSession(...)` and stage cookie mutation through `signIn(...)` / `signOut()`. Signed cookies provide integrity and tamper resistance only; payloads are not encrypted and must not contain secrets or sensitive data.

Banned:
- new mutation helpers such as `ctx.upload`, `ctx.files`, `ctx.login`, or `ctx.sessionStore`
- provider abstraction, OAuth, RBAC, or generic auth service language in this surface
- non-JSON-safe or non-plain-object session payloads

Definition of Done:
- `getSession()` returns the decoded session object or `null`
- `requireSession(...)` uses route-chosen redirect or deny policy and does not collapse into a 500 path
- `signIn(...)` / `signOut()` keep ordinary HTML forms and redirects first-class
- dev, preview, and packaged node behave the same way

Failure Modes:
- auth redirects are hardcoded by the framework instead of chosen by route code
- cookie mutation requires generic header escape hatches
- tampered cookies throw instead of behaving as unauthenticated

Evidence:
- parity tests cover the same cookie-session flow across dev, preview, and packaged node
