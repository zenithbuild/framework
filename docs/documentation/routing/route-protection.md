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

Zenith provides a secure, deterministic route protection mechanism via two optional async exports: `guard(ctx)` and `load(ctx)`.

**Core Principle ("Server is Security"):** True route protection only happens on the server. Client-side protection is a UX enhancement (preventing UI flashes) but is never a security boundary. `/__zenith/route-check` does not grant security; it only avoids flash.

Zenith enforces this principle by executing `guard` and `load` on the server before rendering HTML, and on the client router as a "no-flash" fallback mechanism.

## The Contract

You can export `guard` and `load` from one `<script server lang="ts">` block in your `.zen` page, or from adjacent sibling modules:

- `<route>.guard.ts` / `<route>.load.ts`
- `page.guard.ts` / `page.load.ts` next to `index.zen`

They must return a canonical `RouteResult`:
- `allow()`
- `redirect(location, status?)`
- `deny(status?, message?)` where status is `401`, `403`, or `404`
- `data(payload)`

### Execution Order

1. **`guard(ctx)`**: Runs first. Determine authorization (e.g., check session cookies).
   - **Allowed Returns:** `allow()`, `redirect()`, `deny()`. 
   - **Forbidden Returns:** `data()` (emits a fatal build-time / runtime error).

2. **`load(ctx)`**: Runs second (only if `guard` did not short-circuit). Fetch data needed for rendering.
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
  <h1>Welcome, {params.user.name}</h1>
  <p>Revenue: {params.metrics.revenue}</p>
</main>
```

## The Context (`ctx`) Object

Both `guard` and `load` receive a single `ctx` object argument which provides access to the request context:
- `ctx.url`: URL instance
- `ctx.params`: Route parameters (e.g. `[id]`)
- `ctx.headers`: Request headers
- `ctx.cookies`: Parsed cookies
- `ctx.request`: Standard `Request` clone
- `ctx.method`: HTTP Method
- `ctx.env`: Shared object to pass data from `guard` to `load`
- `ctx.allow()`, `ctx.redirect()`, `ctx.deny()`, `ctx.data()`: Bound constructors

## Routing Behavior

### Static Site Generation (SSG)
Routes protected with `guard(ctx)` or `load(ctx)` **cannot be statically generated**. If you have `export const prerender = true` in the same file, or enforce global static build, the compiler will throw a build error.

### Client Router (Advisory Preflight, Server-Authoritative Commit)
When navigating via marked soft-nav links (`<a data-zen-link>`), the router may preflight guarded server routes through `/__zenith/route-check` using the target pathname plus query string. That preflight is advisory only.

The actual soft-navigation authority is the direct same-origin HTML fetch for the target URL:
- if the server returns a successful HTML page, the router may soft-commit it
- if the server returns a redirect, deny, non-HTML response, or fetch failure, the router falls back to browser navigation

Client routing never overrules the server result.

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
- `deny(401|403|404, ...)` returns a matched-route status and plain-text body immediately.
- A matched-route `deny(404, ...)` is different from an unmatched route 404.
- A thrown error inside an executing `guard(ctx)` or `load(ctx)` returns `500 text/plain`.
- If Zenith cannot produce a canonical route result from the extracted server module at all, the direct HTML response carries `__zenith_error.code = "LOAD_FAILED"`.
