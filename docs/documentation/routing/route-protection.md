---
title: "Route Protection (guard/load)"
description: "How to securely protect Zenith routes using server-enforced guard and load exports."
version: "0.4"
status: "canonical"
last_updated: "2026-02-27"
tags: ["routing", "security", "guard", "load"]
nav:
  order: 50
---

# Route Protection

Zenith provides a secure, deterministic route protection mechanism via two optional async exports: `guard(ctx)` and `load(ctx)`.

**Core Principle ("Server is Security"):** True route protection only happens on the server. Client-side protection is a UX enhancement (preventing UI flashes) but is never a security boundary. `/__zenith/route-check` does not grant security; it only avoids flash.

Zenith enforces this principle by executing `guard` and `load` on the server before rendering HTML, and on the client router as a "no-flash" fallback mechanism.

## The Contract

You can export `guard` and `load` from `<script server lang="ts">` in your `.zen` component, or from adjacent `page.guard.ts` / `page.load.ts` files.

They must return a canonical `RouteResult`:
- `allow()`
- `redirect(location, status?)`
- `deny(status?, message?)`
- `data(payload)`

### Execution Order

1. **`guard(ctx)`**: Runs first. Determine authorization (e.g., check session cookies).
   - **Allowed Returns:** `allow()`, `redirect()`, `deny()`. 
   - **Forbidden Returns:** `data()` (emits a fatal build-time / runtime error).

2. **`load(ctx)`**: Runs second (only if `guard` did not short-circuit). Fetch data needed for rendering.
   - **Allowed Returns:** `data()`, `redirect()`, `deny()`.
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

### Client Router (No-Flash UX)
When navigating via SPA links (`<a data-zen-link>`), the Zenith Router detects guarded server routes. It intercepts the navigation, pings `/__zenith/route-check` in the background, and will only transition the browser once the server allows access. If denied, the user remains on their current page without a flash of unauthorized content.

If redirected, the router seamlessly follows the redirect.

### Optional Client Policy and Events
For SPA UX tuning (not security), you can configure route-protection behavior and subscribe to lifecycle events:

```ts
import { setRouteProtectionPolicy, on, off } from "@zenithbuild/router";

setRouteProtectionPolicy({
  defaultLoginPath: "/login",
  deny401RedirectToLogin: true,
  forbiddenPath: "/403",
  onDeny: "stay" // or "redirect" | "render403" | (result) => {}
});

const handleDeny = (payload) => {
  console.warn("Denied route", payload.routeId, payload.result?.status);
};

on("route:deny", handleDeny);
// later:
off("route:deny", handleDeny);
```

Supported route-protection events:
- `guard:start`
- `guard:end`
- `route-check:start`
- `route-check:end`
- `route-check:error`
- `route:deny`
- `route:redirect`
