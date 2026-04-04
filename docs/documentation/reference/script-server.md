---
title: "Script Server Reference"
description: "Public contract for `<script server>` exports and context access."
version: "0.5"
status: "canonical"
last_updated: "2026-04-01"
tags: ["reference", "server", "script-server"]
---

# Script Server Reference

## Contract: Supported Exports

Contract: Zenith has two explicit server route kinds:
- page routes on `.zen` files with optional `<script server>`
- dedicated resource routes on `*.resource.ts` or `page.resource.ts`

Invariant: `guard(ctx)`, `action(ctx)`, and `load(ctx)` accept exactly one argument. Page routes keep HTML ownership; resource routes keep non-HTML ownership. Zenith does not overload one route kind into the other.

Definition of Done:
- Public examples use only allowed exports for the route kind being documented.
- Context access happens through `ctx` argument.
- Mutation examples use normal HTML forms first and opt into client enhancement separately.
- Multipart upload examples stay on native `await ctx.request.formData()` inside `action(ctx)`.
- `exportPaths` examples use `export const exportPaths = [...]` with literal concrete pathnames for the `static-export` concrete prerender contract.

Failure Modes:
- Page routes and resource routes are documented as if they share the same result kinds.
- `guard(ctx)` attempts to act as a payload channel.
- `action(ctx)` expands into a generic server function surface instead of a route-owned handler.
- `exportPaths` is used as a dynamic runtime loader instead of the `static-export` compile-time concrete export contract.
- Runtime depends on undeclared context globals.

Evidence:
- Server export validation tests enforce allowed combinations and signatures.

### Page Routes

Page routes support:
- optional `guard(ctx)`
- optional `action(ctx)`
- one payload source: `data(...)` or `load(ctx)`
- optional `prerender`
- optional `exportPaths` for the `static-export` concrete prerender contract

Page routes return HTML-oriented route results:
- `data(payload)`
- `invalid(payload, 400|422)`
- `redirect(...)`
- `deny(...)`

Page routes do **not** support `json(...)`, `text(...)`, `stream(...)`, or `sse(...)`.

### Resource Routes

Resource routes live in dedicated modules:
- `src/api/ping.resource.ts` (preferred when the project uses `src/` layout)
- `pages/api/ping.resource.ts`
- `pages/settings/page.resource.ts`

Resource routes support:
- optional `guard(ctx)`
- optional `load(ctx)` for `GET` and `HEAD`
- optional `action(ctx)` for `POST`

Resource routes must export at least `load(ctx)` or `action(ctx)`.

Resource routes return non-HTML route results:
- `json(payload, status = 200)`
- `text(body, status = 200)`
- `download(body, { filename, contentType? })`
- `stream(body, { status?, contentType? })`
- `sse(events)`
- `redirect(...)`
- `deny(...)`

Resource routes do **not** support `data(...)`, `invalid(...)`, `prerender`, or `exportPaths`.
This milestone also does **not** support arbitrary `Response`, `file(...)`, inline serving, page-route streaming, `Blob`, `File`, range requests, or filesystem-path helper APIs.

## Contract: Context Shape

Contract: `ctx` includes `params`, `url`, `request`, and route metadata.

Invariant: Route metadata is deterministic per matched request.

Definition of Done:
- Examples show explicit access through `ctx.params` and `ctx.route`.
- `action(ctx)` examples read standard form posts through `await ctx.request.formData()`.
- No ambient context assumptions in server docs.

Failure Modes:
- Route parameters are read from implicit globals.
- Upload examples invent `ctx.upload`, `ctx.files`, or another non-contract mutation surface.
- Route metadata shape varies across environments.

Evidence:
- Dev/preview route tests validate parity for route metadata and params.

`ctx.request` is the canonical request input for route-owned mutations. In `action(ctx)`, standard HTML form posts, including `multipart/form-data`, are read through native `await ctx.request.formData()`. Fields and uploaded files stay as native Web Platform values on the request side; returned route payloads must remain JSON-safe.

The same `ctx` shape is used for dedicated resource routes. Resource `action(ctx)` reads multipart uploads through the same native `await ctx.request.formData()` path and keeps `ctx.auth`, `ctx.cookies`, and staged cookie mutation semantics identical to page routes.

`stream(...)` and `sse(...)` are standalone helpers imported from `zenith:server-contract`. They are not exposed as `ctx.stream(...)` or `ctx.sse(...)`.

`withMiddleware(...)` is also imported from `zenith:server-contract` for explicit route-level composition.

## Contract: Explicit Middleware Composition

Contract: middleware composition is explicit and server-only.

Invariant:
- route modules compose middleware directly with `withMiddleware(handler, ...middleware)`
- `withMiddleware(handler, a, b)` composes as `a(b(handler))`
- middleware is route-owned; there is no root/global or inherited middleware surface in this milestone

Definition of Done:
- middleware returns a wrapped handler function
- wrapped handlers return only valid result helpers for the route kind (`data/invalid/...` for page routes, `json/text/download/stream/sse/...` for resource routes)
- middleware may short-circuit by returning a valid route result or by throwing

Failure Modes:
- middleware appears as `ctx.middleware` or `ctx.withMiddleware`
- docs imply implicit route-tree middleware inheritance
- middleware is described as `req/res/next` chain semantics

## Contract: Freshness Bridge

Contract: `<script server>` stays on Zenith's existing route boundary. Freshness across route kinds remains explicit.

Invariant:
- page routes already return fresh HTML through navigation and page `action(ctx)` flows
- resource routes stay direct and non-HTML
- `refreshCurrentRoute()` is the one router-owned bridge when app code needs fresh current-page HTML after a resource write or resource-route auth change

Failure Modes:
- docs imply `action(ctx)` or resource helpers trigger automatic page refresh outside the page-route HTML flow
- server docs drift into cache invalidation, query-client, or background sync language

## Contract: Resource Route Responses

Contract: dedicated resource routes are the only public non-HTML server surface in this milestone.

Invariant: resource routes stay on Zenith's existing server boundary. They do not introduce a second backend model, arbitrary `Response` returns, or arbitrary header mutation.

Definition of Done:
- `load(ctx)` on a resource route handles `GET` and `HEAD`.
- `action(ctx)` on a resource route handles `POST`.
- `json(payload, status?)` returns `application/json`.
- `text(body, status?)` returns `text/plain; charset=utf-8`.
- `download(body, { filename, contentType? })` returns an attachment-style response with fixed `Content-Disposition: attachment`.
- `stream(body, { status?, contentType? })` streams a `ReadableStream` or `AsyncIterable` body and may set an explicit content type.
- `sse(events)` returns `text/event-stream; charset=utf-8` with standard SSE framing.
- `redirect(...)` and `deny(...)` behave the same way they do on page routes.
- `json(payload)` reuses the existing JSON-safe top-level plain-object contract.
- `download(...)` accepts only `string`, `Uint8Array`, `ArrayBuffer`, or `Buffer`-compatible bytes and enforces a 5 MiB payload cap.

Failure Modes:
- `json(...)` or `text(...)` are documented as valid on page routes.
- `data(...)` or `invalid(...)` are documented as valid on resource routes.
- Resource examples imply arbitrary `Response`, page-route streaming, range requests, or a generic binary/media platform.
- Router docs imply resource routes participate in soft-nav HTML commits or `data-zen-form` HTML enhancement.

Evidence:
- Dev, preview, packaged-node, and hosted parity tests cover JSON, text, attachment downloads, stream, SSE, auth, cookies, and multipart POSTs on dedicated resource routes.

## Contract: Route-Owned Cookie Sessions

Contract: `ctx.auth` provides one narrow cookie-backed session workflow inside `guard(ctx)`, `action(ctx)`, and `load(ctx)`.

Invariant: session state lives in one framework-owned signed cookie and uses a JSON-safe plain-object payload only.

Definition of Done:
- `await ctx.auth.getSession()` returns the decoded session object or `null`.
- `await ctx.auth.requireSession({ redirectTo, status? })` or `await ctx.auth.requireSession({ deny, message? })` short-circuits through the route's explicit policy.
- `await ctx.auth.signIn(sessionObject)` and `await ctx.auth.signOut()` stage cookie mutation only; the route still returns the route-kind-appropriate result such as `redirect(...)`, `data(...)`, `invalid(...)`, `json(...)`, `text(...)`, or `download(...)`.
- `ZENITH_SESSION_SECRET` is read from env when a route uses `ctx.auth`.

Failure Modes:
- Auth examples imply provider abstraction, OAuth, RBAC, or a generic auth service.
- `signIn(...)` receives a non-plain or non-JSON-safe session payload.
- Docs imply `ctx.auth` is available outside route-owned server exports.

Evidence:
- Dev, preview, and packaged-node session tests cover sign-in, session read, require-session redirect/deny, and sign-out parity.
