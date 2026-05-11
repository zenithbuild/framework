---
title: "Server Data Contract"
description: "Allowed server exports, load context shape, and serialization constraints."
version: "0.5"
status: "canonical"
last_updated: "2026-04-01"
tags: ["server", "data", "contracts"]
---

# Server Data Contract

## Contract: Allowed Server Exports

Contract: Zenith has two explicit server route kinds with separate result helpers:
- page routes
- dedicated resource routes (for `src/` layout projects, `src/api/**` is the preferred discovery convention)

Invariant: `guard(ctx)` is the route-protection gate for both route kinds. Page routes own HTML payloads. Resource routes own explicit non-HTML direct responses. Legacy payload exports may not mix with the canonical surface.

Banned:
- Exporting both `data` and `load` in one file.
- Returning `data(...)` from `guard(ctx)`.
- Mixing `data` or `load` with legacy `ssr_data` / `props` / `ssr` exports.
- Combining `action(ctx)` with `prerender = true`.
- Using `exportPaths` as an implicit runtime param source instead of a literal list of concrete pathnames.
- Server exports outside the public contract.

Definition of Done:
- At most one payload source is defined.
- `guard(ctx)`, `action(ctx)`, and `load(ctx)` each use exactly one argument.
- `action(ctx)` may read standard form submissions, including multipart uploads, only through native `await ctx.request.formData()`.
- `exportPaths` is a literal array of concrete pathnames when present, and it stays scoped to the `static-export` concrete prerender contract instead of becoming runtime route state.
- Expected mutation validation failures return `invalid(payload, 400|422)` and re-render through the same route payload path.

Failure Modes:
- Mixed payload exports produce ambiguous ownership.
- Invalid `guard` / `action` / `load` signatures break deterministic context access.
- Mutation handlers turn into ad hoc RPC surfaces instead of route-owned form posts.
- Upload handling invents `ctx.upload`, `ctx.files`, or another non-contract helper.

Evidence:
- Build-time server export validation rejects mixed or invalid patterns.

### Page Routes

Page routes allow:
- optional `guard(ctx)`
- optional `action(ctx)`
- one payload source: `data(...)` or `load(ctx)`
- optional `prerender`
- optional `exportPaths` for the `static-export` concrete prerender contract

Page routes return:
- `data(payload)`
- `invalid(payload, 400|422)`
- `redirect(...)`
- `deny(...)`

### Resource Routes

Dedicated resource routes allow:
- optional `guard(ctx)`
- optional `load(ctx)` for `GET` / `HEAD`
- optional `action(ctx)` for `POST`

Resource routes return:
- `json(payload, status = 200)`
- `text(body, status = 200)`
- `download(body, { filename, contentType? })`
- `stream(body, { status?, contentType? })`
- `sse(events)`
- `redirect(...)`
- `deny(...)`

Resource routes do **not** allow `data(...)`, `invalid(...)`, `prerender`, or `exportPaths`.
Page routes do **not** allow `json(...)`, `text(...)`, `download(...)`, `stream(...)`, or `sse(...)`.

## Contract: Explicit Middleware Composition

Contract: middleware composition is explicit and route-owned.

Invariant:
- route modules compose middleware directly with `withMiddleware(handler, ...middleware)`
- composition order is deterministic and left-to-right by declaration (`withMiddleware(handler, a, b) = a(b(handler))`)
- middleware remains server-contract-only and is not exposed as a route context helper

Definition of Done:
- middleware returns a wrapped handler function
- middleware may short-circuit with any valid result kind for the wrapped handler type, throw, or call wrapped handler
- middleware does not add new result kinds or bypass route contract validation

Failure Modes:
- root/global middleware becomes automatic
- folder inheritance semantics appear
- middleware drifts into generic request/response interceptor chains

## Contract: Serialization Rules

Contract: Server payload is a top-level plain object with JSON-safe values.

Invariant: Non-serializable values fail with explicit diagnostics.

Banned:
- Circular payload objects.
- `File`, `FormData`, or other non-JSON upload values in returned payloads.
- Payload members with unsupported runtime types.
- Prototype pollution keys.

Definition of Done:
- Payload serialization is deterministic and lossless.
- Error envelopes are explicit when load fails.

Failure Modes:
- Silent payload coercion.
- Sensitive values leaking to client payload.

Evidence:
- Serialization guard tests fail on unsupported payload values.

## Contract: Resource Response Rules

Contract: the public non-HTML resource surface is limited to JSON, plain text, `stream(...)`, `sse(...)`, and one attachment-style `download(...)` helper.

Invariant: resource responses stay explicit, artifact-free, and route-owned. Zenith does not expose arbitrary `Response`, arbitrary headers, or inline file serving in this milestone.

Banned:
- arbitrary `Response` returns
- `file(...)`, inline serving, page-route streaming, `Blob`, `File`, range requests, or filesystem-path helper APIs
- top-level non-object JSON payloads
- using resource routes as a generic RPC or REST framework

Definition of Done:
- `json(payload, status?)` uses the same JSON-safe top-level plain-object contract as page `data(...)`
- `text(body, status?)` accepts string bodies only
- `download(body, { filename, contentType? })` always emits `Content-Disposition: attachment`
- `stream(body, { status?, contentType? })` accepts only `ReadableStream` or `AsyncIterable`
- `sse(events)` accepts only `AsyncIterable` event sources and emits standard SSE framing
- `download(...)` accepts only `string`, `Uint8Array`, `ArrayBuffer`, or `Buffer`-compatible bytes and enforces a 5 MiB payload cap
- `redirect(...)` and `deny(...)` preserve existing status/control-flow meaning
- auth, cookie staging, and multipart parsing behave identically across dev, preview, and packaged node

Failure Modes:
- page-route helpers and resource-route helpers blur together
- response semantics differ by server path
- docs imply arbitrary `Response`, generic file serving, page-route streaming, or a broader media platform

Evidence:
- parity tests cover JSON, text, attachment downloads, stream, SSE, cookies, auth, multipart, and misuse failures on dedicated resource routes

## Contract: Route-Owned Cookie Sessions

Contract: `ctx.auth` provides one cookie-backed session workflow inside `guard(ctx)`, `action(ctx)`, and `load(ctx)`.

Invariant: routes read session state with `getSession()` / `requireSession(...)` and stage cookie mutation with `signIn(...)` / `signOut()` while keeping ordinary HTML forms and redirects first-class. Signed cookies are tamper-resistant but not encrypted, so session payloads must not contain secrets or sensitive data.

Banned:
- provider abstraction, OAuth, social login, RBAC, or generic auth service behavior in this milestone
- non-JSON-safe session payloads
- hardcoded framework login routes

Definition of Done:
- session read, require, sign-in, and sign-out are truthful in dev, preview, and packaged node
- invalid, tampered, or expired cookies behave as unauthenticated
- routes choose redirect or deny behavior explicitly

Failure Modes:
- `ctx.auth` exists in types/docs but is still stubbed at runtime
- cookie mutation requires arbitrary header mutation
- hosted adapter parity is implied before it exists

Evidence:
- route-session parity tests pass across the supported server paths
