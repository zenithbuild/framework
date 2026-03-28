---
title: "Route Protection (guard/load)"
description: "How to securely protect Zenith routes using server-enforced guard and load exports."
version: "0.4"
status: "canonical"
last_updated: "2026-03-12"
tags: ["routing", "security", "guard", "load"]
nav:
  order: 50
---

# Route Protection

Zenith provides a secure, deterministic server route mechanism via three optional async exports: `guard(ctx)`, `action(ctx)`, and `load(ctx)`.

**Core Principle ("Server is Security"):** True route protection only happens on the server. Client-side protection is a UX enhancement (preventing UI flashes) but is never a security boundary. `/__zenith/route-check` does not grant security; it only avoids flash.

Zenith enforces this principle by executing `guard`, `action`, and `load` on the server before returning the final HTML response, and on the client router as an advisory UX layer only where applicable.

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

### Execution Order

1. **`guard(ctx)`**: Runs first. Determine authorization (e.g., check session cookies).
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

## Example: Secure Dashboard

```zen
<script server lang="ts">
  import { allow, redirect, deny, data } from 'zenith:server-contract';
  import { getUserSession } from '../lib/auth';
  import { fetchDashboardMetrics } from '../lib/db';

  export async function guard(ctx) {
    const session = await getUserSession(ctx.cookies.session_id);
    if (!session) {
      return redirect('/login', 302);
    }
    if (session.role !== 'admin') {
      return deny(403, 'Admins only');
    }
    // Store data in ctx.env if you want to pass it to load
    ctx.env.user = session;
    return allow();
  }

  export async function load(ctx) {
    const metrics = await fetchDashboardMetrics(ctx.env.user.id);
    if (!metrics) {
      return deny(404, 'No metrics found');
    }
    return data({ user: ctx.env.user, metrics });
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
- `ctx.allow()`, `ctx.redirect()`, `ctx.deny()`, `ctx.invalid()`, `ctx.data()`: Bound constructors

`ctx.action` is either:
- `null`
- `{ ok: true, status: 200, data }`
- `{ ok: false, status: 400|422, data }`

## Routing Behavior

### Static Site Generation (SSG)
Routes using `guard(ctx)`, `action(ctx)`, or `load(ctx)` **cannot be statically generated**. If you have `export const prerender = true` in the same file, or enforce global static build, the compiler will throw a build error.

### Client Router (Advisory Preflight, Server-Authoritative Commit)
When navigating via marked soft-nav links (`<a data-zen-link>`), the router may preflight guarded server routes through `/__zenith/route-check` using the target pathname plus query string when the configured target exposes that endpoint. That preflight is advisory only.

Today, advisory route-check is available in local dev/preview and the packaged `node` target. Hosted `vercel` and `netlify` server adapters skip advisory route-check and rely on the direct same-origin HTML request instead.

The actual soft-navigation authority is the direct same-origin HTML fetch for the target URL:
- if the server returns a successful HTML page, the router may soft-commit it
- if the server returns a redirect, deny, non-HTML response, or fetch failure, the router falls back to browser navigation

Client routing never overrules the server result.

### Progressive Enhancement Forms

Normal HTML `POST` forms work without JavaScript.

If you opt in with `data-zen-form`, the client router may progressively enhance the submission for same-origin server routes:
- the browser still submits `FormData`
- the server still owns the mutation through `action(ctx)`
- the response is the same matched route HTML, not a separate RPC payload
- expected validation failures use `invalid(...)` and re-render the route with `ctx.action`

This enhancement is intentionally narrow:
- `POST` only
- same-origin only
- server routes only
- no optimistic UI
- no file-upload abstraction

### Optional Client Policy and Events
You can still subscribe to advisory route-protection events:

```ts
import { on, off } from "@zenithbuild/router";

const handleDeny = (payload) => {
  console.warn("Denied route", payload.routeId, payload.result?.status);
};

on("route:deny", handleDeny);
// later:
off("route:deny", handleDeny);
```

Supported route-protection events:
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
