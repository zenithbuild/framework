---
title: "Route Protection (guard/load)"
description: "How to securely protect Zenith routes using server-enforced guard and load exports."
version: "0.5"
status: "canonical"
last_updated: "2026-05-25"
tags: ["routing", "security", "guard", "load"]
nav:
  order: 50
section: "Server and Data"
sectionOrder: 4
order: 3
---

# Route Protection

Zenith provides a secure, deterministic server route mechanism via three optional async exports: `guard(ctx)`, `action(ctx)`, and `load(ctx)`.

**Core Principle ("Server is Security"):** True route protection only happens on the server. Client-side protection is a UX enhancement (preventing UI flashes) but is never a security boundary. `/__zenith/route-check` does not grant security; it only avoids flash.

Zenith enforces this principle by executing `guard`, `action`, and `load` on the server before returning the final HTML response, and on the client router as an advisory UX layer only where applicable.

Zenith now has two explicit server route kinds:
- page routes, which own HTML
- dedicated resource routes (`*.resource.ts` / `page.resource.ts`), which own explicit non-HTML direct responses (for `src/` layout projects, prefer `src/api/**`)

## The Contract

You can export `guard`, `action`, and `load` from one `<script server lang="ts">` block in your `.zen` page, or from adjacent sibling modules:

- `<route>.guard.ts` / `<route>.action.ts` / `<route>.load.ts`
- `page.guard.ts` / `page.action.ts` / `page.load.ts` next to `index.zen`

They must return a canonical `RouteResult`:
- `allow()`
- `redirect(location, status?)`
- `deny(status?, message?)` where status is `401`, `403`, or `404`
- `data(payload)`
- `invalid(payload, 400|422)` for expected action validation failures

Dedicated resource routes live in dedicated modules:
- `src/api/<route>.resource.ts` (preferred when the project uses `src/` layout)
- `<route>.resource.ts`
- `page.resource.ts`

They return:
- `json(payload, status?)`
- `text(body, status?)`
- `download(body, { filename, contentType? })`
- `stream(body, { status?, contentType? })`
- `sse(events)`
- `redirect(location, status?)`
- `deny(status?, message?)`

### Execution Order

1. **`guard(ctx)`**: Runs first. Determine authorization (for example, with `await ctx.auth.requireSession(...)`).
   - **Allowed Returns:** `allow()`, `redirect()`, `deny()`. 
   - **Forbidden Returns:** `data()` (emits a fatal build-time / runtime error).

2. **`action(ctx)`**: Runs on `POST` requests after `guard(ctx)` and before `load(ctx)`.
   - **Allowed Returns:** `data()`, `invalid(payload, 400|422)`, `redirect()`, `deny()`.
   - **Purpose:** Own the mutation, then hand the normalized result to `load(ctx)` through `ctx.action`.
   - **Scope Guard:** `action(ctx)` is the canonical form mutation hook, not a general RPC surface.

3. **`load(ctx)`**: Runs after `guard(ctx)` and after `action(ctx)` on POST requests. Fetch data needed for rendering.
   - **Allowed Returns:** `data()`, `redirect()`, `deny()`.
   - **Plain Object Shortcut:** Returning a plain object is treated the same as `data(payload)`.
   - **Legacy Compatibility:** You cannot mix `load`/`data` exports with legacy `ssr`/`ssr_data` exports in the same route.

### Dedicated Resource Routes

Resource routes keep the same `guard(ctx)` and `ctx.auth` meaning, but do not render HTML:

1. **`guard(ctx)`**: Optional. Runs first and may return `allow()`, `redirect()`, or `deny()`.
2. **`load(ctx)`**: Handles `GET` and `HEAD`.
   - **Allowed Returns:** `json(...)`, `text(...)`, `download(...)`, `stream(...)`, `sse(...)`, `redirect()`, `deny()`.
3. **`action(ctx)`**: Handles `POST`.
   - **Allowed Returns:** `json(...)`, `text(...)`, `download(...)`, `stream(...)`, `sse(...)`, `redirect()`, `deny()`.

Resource routes do **not** support:
- `data(...)`
- `invalid(...)`
- `prerender`
- `exportPaths`
- arbitrary `Response`
- `file(...)`
- inline serving
- range requests
- `Blob`, `File`, or filesystem-path public helpers

## Example: Secure Dashboard

```zen
<script server lang="ts">
  import { allow, deny, data } from 'zenith:server-contract';
  import { fetchDashboardMetrics } from '../lib/db';

  export async function guard(ctx) {
    const session = await ctx.auth.requireSession({ redirectTo: '/login', status: 302 });
    if (session.role !== 'admin') {
      return deny(403, 'Admins only');
    }
    ctx.env.userId = String(session.userId || '');
    ctx.env.userName = String(session.name || '');
    return allow();
  }

  export async function load(ctx) {
    const metrics = await fetchDashboardMetrics(ctx.env.userId);
    if (!metrics) {
      return deny(404, 'No metrics found');
    }
    return data({ user: { id: ctx.env.userId, name: ctx.env.userName }, metrics });
  }
</script>

<main>
  <h1>Welcome, {data.user.name}</h1>
  <p>Revenue: {data.metrics.revenue}</p>
</main>
```

## The Context (`ctx`) Object

`guard`, `action`, and `load` receive a single `ctx` object argument which provides access to the request context:
- `ctx.url`: URL instance
- `ctx.params`: Route parameters (e.g. `[id]`)
- `ctx.headers`: Request headers
- `ctx.cookies`: Parsed cookies
- `ctx.request`: Standard `Request` clone
- `ctx.method`: HTTP Method
- `ctx.env`: Shared object to pass data from `guard` to `load`
- `ctx.action`: `null` on normal GET requests, or the normalized action result during the same POST request
- `ctx.auth.getSession()`: Returns the decoded session object or `null`
- `ctx.auth.requireSession({ redirectTo, status? } | { deny, message? })`: Short-circuits through route-chosen redirect or deny behavior
- `ctx.auth.signIn(sessionObject)`: Stages the framework-owned session cookie for the outgoing route response
- `ctx.auth.signOut()`: Stages clearing that same session cookie
- `ctx.allow()`, `ctx.redirect()`, `ctx.deny()`, `ctx.invalid()`, `ctx.data()`, `ctx.json()`, `ctx.text()`, `ctx.download()`: Bound constructors

`ctx.action` is either:
- `null`
- `{ ok: true, status: 200, data }`
- `{ ok: false, status: 400|422, data }`

Resource routes still receive the same `ctx` shape. They simply return `json(...)`, `text(...)`, or `download(...)` instead of HTML-oriented `data(...)` / `invalid(...)`.

`stream(...)` and `sse(...)` are standalone helpers imported from `zenith:server-contract`. They are not exposed as `ctx.stream(...)` or `ctx.sse(...)`.

## Cookie Sessions (`ctx.auth`)

Zenith's first auth milestone is intentionally narrow:
- one framework-owned signed cookie
- one JSON-safe plain-object session payload
- route-owned session read and require logic
- route-owned sign-in and sign-out through ordinary HTML form flows

Signed session cookies provide integrity and tamper resistance only. The cookie payload is not encrypted, so do not store secrets, tokens, or sensitive user data in signed session cookies.

Routes use:
- `await ctx.auth.getSession()`
- `await ctx.auth.requireSession({ redirectTo: "/login", status?: 302|303|307 })`
- `await ctx.auth.requireSession({ deny: 401|403|404, message?: string })`
- `await ctx.auth.signIn(sessionObject)`
- `await ctx.auth.signOut()`

`getSession()` returns the decoded session object or `null`. Invalid, tampered, or expired cookies behave as unauthenticated.

`signIn(...)` and `signOut()` only stage cookie mutation. Your route still decides whether to return `redirect(...)`, `data(...)`, `invalid(...)`, `json(...)`, `text(...)`, or `download(...)`, depending on the route kind.

Freshness note:
- page-route login/logout flows are already automatically fresh because they stay on the HTML route boundary
- resource-route login/logout flows remain direct/manual from a page-freshness perspective
- when a resource-route auth change should refresh the current page, app code calls router-side `refreshCurrentRoute()`

The cookie secret comes from `ZENITH_SESSION_SECRET`. For packaged `node` deployments behind TLS termination, set `ZENITH_PUBLIC_ORIGIN` to the external HTTPS origin so staged session cookies include `Secure`.

This milestone does **not** add:
- OAuth or provider abstraction
- social login
- RBAC or policy framework
- storage-backed session stores
- a generic auth service

Today this contract is implemented in local dev, local preview, and the packaged `node` target. Hosted adapter auth parity remains deferred.

### Example: Login Action

```ts
export async function action(ctx) {
  const form = await ctx.request.formData();
  const email = String(form.get('email') || '').trim();

  if (!email) {
    return ctx.invalid({ field: 'email', message: 'Email required' }, 422);
  }

  await ctx.auth.signIn({ userId: 'user_1', email });
  return ctx.redirect('/account', 303);
}
```

### Example: Logout Action

```ts
export async function action(ctx) {
  await ctx.auth.signOut();
  return ctx.redirect('/login', 303);
}
```

## Resource Routes

Use dedicated resource modules when the route should answer direct requests with JSON, plain text, streamed bodies, SSE, or attachment downloads instead of HTML.

### Example: JSON Resource Route

```ts
import { allow, json } from 'zenith:server-contract';

export async function guard(ctx) {
  await ctx.auth.requireSession({ deny: 401, message: 'Unauthorized' });
  return allow();
}

export async function load(ctx) {
  const session = await ctx.auth.getSession();
  return json({ userId: session.userId, email: session.email });
}
```

### Example: Multipart Resource Action

```ts
import { json } from 'zenith:server-contract';

export async function action(ctx) {
  const form = await ctx.request.formData();
  const title = String(form.get('title') || '').trim();
  const file = form.get('attachment');

  if (!title || !(file instanceof File)) {
    return json({ error: 'Missing upload fields' }, 422);
  }

  return json({
    title,
    fileName: file.name,
    fileSize: file.size
  });
}
```

Resource routes are not page routes:
- they are not soft-nav HTML targets
- `data-zen-form` does not enhance them as matched-route HTML submissions
- they keep the same direct request, auth, cookie, and multipart boundaries as page routes
- they do not automatically refresh the current page after writes; `refreshCurrentRoute()` is the explicit bridge when the current page needs fresh HTML route truth

### Example: Attachment Download Route

```ts
export async function load(ctx) {
  return ctx.download('id,name\n1,Zenith\n', {
    filename: 'accounts.csv',
    contentType: 'text/csv; charset=utf-8'
  });
}
```

`download(...)` is intentionally narrow:
- fixed `Content-Disposition: attachment`
- fixed status `200`
- only `string`, `Uint8Array`, `ArrayBuffer`, or `Buffer`-compatible bytes
- 5 MiB payload cap

`stream(...)` and `sse(...)` stay narrow too:
- resource-route only
- imported from `zenith:server-contract`
- no arbitrary `Response` escape hatch
- no page-route streaming

## Routing Behavior

### Static Site Generation (SSG)
Routes using `guard(ctx)`, `action(ctx)`, or `load(ctx)` **cannot be statically generated**. If you have `export const prerender = true` in the same file, or enforce global static build, the compiler will throw a build error.

### Client Router (Advisory Preflight, Server-Authoritative Commit)
When navigating via marked soft-nav links (`<a data-zen-link>`), the router may preflight guarded server routes through `/__zenith/route-check` using the target pathname plus query string when the configured target exposes that endpoint. That preflight is advisory only.

Today, advisory route-check is available in local dev/preview, the packaged `node` target, and hosted `vercel` / `netlify` server adapters.

Global middleware does not run for route-check in V1. Route-check remains guard-only and advisory, so real navigation may redirect or deny through global middleware even when route-check would allow.

The actual soft-navigation authority is the direct same-origin HTML fetch for the target URL:
- if the server returns a successful HTML page, the router may soft-commit it
- if the server returns a redirect, deny, non-HTML response, or fetch failure, the router falls back to browser navigation

Client routing never overrules the server result.

Resource routes are excluded from this HTML routing path. The client router does not soft-commit them as pages, and `data-zen-form` does not treat them as HTML re-render targets.

### Progressive Enhancement Forms

Normal HTML `POST` forms work without JavaScript.

If you opt in with `data-zen-form`, the client router may progressively enhance the submission for same-origin server routes:
- the browser still submits `FormData`
- standard multipart form submissions stay on that same `FormData` path
- the server still owns the mutation through `action(ctx)`
- the response is the same matched route HTML, not a separate RPC payload
- expected validation failures use `invalid(...)` and re-render the route with `ctx.action`

This enhancement is intentionally narrow:
- `POST` only
- same-origin only
- server routes only
- no optimistic UI
- no file-upload abstraction

For upload-capable routes, read both ordinary fields and files inside `action(ctx)` with native `await ctx.request.formData()`. Zenith does not add `ctx.upload`, `ctx.files`, storage adapters, or a separate upload protocol for this flow.

For dedicated resource routes, use ordinary same-origin requests or standard HTML forms without `data-zen-form` enhancement. The resource response is JSON or plain text, not same-route HTML.

### Optional Client Policy and Events
The router exposes advisory client policy hooks for navigation UX only. These hooks can reduce flashes or choose a local fallback, but they are never authorization and never replace server `guard(ctx)` / `load(ctx)`.

```ts
import { setAdvisoryRoutePolicy } from "@zenithbuild/router";

setAdvisoryRoutePolicy({
  onDeny: "redirect",
  defaultLoginPath: "/login",
  deny401RedirectToLogin: true,
  forbiddenPath: "/forbidden"
});
```

Compatibility aliases remain available for older code:
- `setRouteProtectionPolicy(...)` -> `setAdvisoryRoutePolicy(...)`
- `_getRouteProtectionPolicy()` -> `_getAdvisoryRoutePolicy()`
- `RouteProtectionPolicy` -> `AdvisoryRoutePolicy`

The compatibility names are deprecated because they sound stronger than what the client router can provide.

You can also subscribe to advisory route events:

```ts
import { on, off } from "@zenithbuild/router";

const handleDeny = (payload) => {
  console.warn("Denied route", payload.routeId, payload.result?.status);
};

on("route:deny", handleDeny);
// later:
off("route:deny", handleDeny);
```

Supported advisory route events:
- `route-check:start`
- `route-check:end`
- `route-check:error`
- `route:deny`
- `route:redirect`

## Direct Request Outcomes

- `redirect(...)` returns the provided 3xx status and `Location` header immediately.
- `invalid(payload, 400|422)` keeps the request on the same route and re-renders with `ctx.action`.
- `deny(401|403|404, ...)` returns a matched-route status and plain-text body immediately.
- A matched-route `deny(404, ...)` is different from an unmatched route 404.
- A thrown error inside an executing `guard(ctx)`, `action(ctx)`, or `load(ctx)` returns `500 text/plain` with the generic body `Internal Server Error`.
- Zenith logs internal route execution failures server-side; direct client responses do not expose the thrown error text.

For dedicated resource routes:
- `json(payload, status?)` returns `application/json`
- `text(body, status?)` returns `text/plain`
- `download(body, { filename, contentType? })` returns an attachment-style response with `Content-Disposition: attachment`
- `stream(body, { status?, contentType? })` streams the response body with `Cache-Control: no-cache`
- `sse(events)` returns `text/event-stream; charset=utf-8` with standard SSE framing
- unsupported methods in this first milestone return `405 Method Not Allowed`
