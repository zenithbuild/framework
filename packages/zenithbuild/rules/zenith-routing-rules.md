# Zenith Routing and Security Rules

Protected routes must use server `guard` and `load` exports. Security lives on the server.

## guard(ctx)

Evaluates first. Must return one of:

- `allow()`
- `redirect(url, status?)`
- `deny(status?, message?)` — use `401`, `403`, or `404`

## load(ctx)

Evaluates after `guard`. Allowed returns:

- `data(payload)`
- `redirect(url, status?)`
- `deny(status?, message?)`

A plain object return is treated as `data(payload)`.

## Where to define them

- Inside a `<script server lang="ts">` block in the route `.zen` file.
- Adjacent `page.guard.ts` and `page.load.ts` modules.
- Route-named siblings such as `dashboard.guard.ts` / `dashboard.load.ts`.

## Server-first security

- Do not create generic client-only route guards.
- Client-side `guard`/`load` execution is advisory UX only (prevents flashes).
- The real security boundary is the server rendering pipeline.

## No static generation for protected routes

A route that uses `guard` or `load` cannot be statically generated:

```ts
// Forbidden
export const prerender = true
```

## Minimal example

```zen
<script server lang="ts">
  import { allow, deny, data } from 'zenith:server-contract'

  export async function guard(ctx) {
    const session = await ctx.auth.requireSession({ redirectTo: '/login', status: 302 })
    if (session.role !== 'admin') {
      return deny(403, 'Admins only')
    }
    ctx.env.userId = String(session.userId)
    return allow()
  }

  export async function load(ctx) {
    const metrics = await fetchDashboardMetrics(ctx.env.userId)
    if (!metrics) {
      return deny(404, 'No metrics found')
    }
    return data({ user: { id: ctx.env.userId }, metrics })
  }
</script>

<main>
  <h1>Welcome, {data.user.id}</h1>
  <p>Revenue: {data.metrics.revenue}</p>
</main>
```
