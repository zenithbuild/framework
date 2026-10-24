---
title: "Global Middleware"
description: "TypeScript-only root middleware for matched server page and resource routes."
version: "0.1"
status: "canonical"
last_updated: "2026-05-25"
tags: ["routing", "middleware", "server"]
nav:
  order: 45
section: "Server and Data"
sectionOrder: 4
order: 5
---

# Global Middleware

Root global middleware is a TypeScript-only server feature for app-level control before route-owned server exports run.

## File Contract

Zenith V1 discovers exactly one root middleware file at the directory that contains `pagesDir`.

Supported:
- `{dirname(pagesDir)}/middleware.ts`
- `{dirname(pagesDir)}/middleware/index.ts`

Unsupported and ignored:
- `middleware.js`
- `middleware/index.js`
- `middleware.tsx`
- `middleware.mts`
- `middleware.cts`

User-authored JavaScript middleware is not part of V1. Internal compiled `.js` output is an implementation detail and does not imply `middleware.js` support.

Middleware must default-export one function with `(ctx, next)`:

```ts
export default async function middleware(ctx, next) {
  return next();
}
```

Named runtime exports are not supported. Type-only exports may be used for local TypeScript types.

## Execution Contract

Root global middleware runs:
- after route match
- after `ctx` creation
- before `guard(ctx)`, `action(ctx)`, and `load(ctx)`
- for matched server page routes
- for matched resource routes
- in dev, preview, packaged `node`, built-in `vercel`, and built-in `netlify` targets

Root global middleware does not run for:
- static assets
- image endpoints
- unmatched 404s
- prerender/static HTML routes
- `/__zenith/route-check`
- static export output

Static-family targets reject discovered global middleware because middleware is server-only:
- `static`
- `static-export`
- `vercel-static`
- `netlify-static`

## Allowed Results

Global middleware V1 may continue or short-circuit:

```ts
export default async function middleware(ctx, next) {
  return next();
}
```

```ts
export default async function middleware(ctx, next) {
  await next();
}
```

```ts
export default async function middleware(ctx, next) {
  return ctx.redirect('/login');
}
```

```ts
export default async function middleware(ctx, next) {
  return ctx.deny(403, 'Forbidden');
}
```

Auth helpers may be used when the server runtime has `ZENITH_SESSION_SECRET` configured:

```ts
export default async function middleware(ctx, next) {
  await ctx.auth.requireSession({ redirectTo: '/login' });
  return next();
}
```

```ts
export default async function middleware(ctx, next) {
  await ctx.auth.requireSession({ deny: 401, message: 'Sign in required' });
  return next();
}
```

`ctx.auth.signIn(...)` and `ctx.auth.signOut()` stage the framework-owned session cookie. The middleware still needs to return `next()`, `ctx.redirect(...)`, or `ctx.deny(...)`.

## Rejected Results

Global middleware V1 rejects:
- `return ctx.allow()`
- `return ctx.data(...)`
- `return ctx.invalid(...)`
- `return ctx.json(...)`
- `return ctx.text(...)`
- `return ctx.download(...)`
- `return new Response(...)`
- plain object returns
- calling `next()` more than once
- returning a different result after `next()`

Global middleware has no arbitrary header API. There is no `ctx.setHeader(...)` middleware surface.

## Security Boundary

Global middleware is trusted application server code. Use it for coarse redirects, request normalization, and session setup that should apply before matched route stages.

Route-owned `guard(ctx)` and `load(ctx)` remain the canonical authorization boundaries. Global middleware is not a replacement for per-route authorization, and static output cannot enforce middleware.

Route-check remains guard-only and advisory in V1. Global middleware does not run for `/__zenith/route-check`, so real navigation may redirect or deny through global middleware even when route-check would allow.

## Route-Local Middleware Is Different

Root global middleware is file-based and app-level.

Route-local `withMiddleware(...)` is an imported helper for handler-level composition. It only runs where route exports opt into it and it is not the same API as root global middleware.

## Hosted Adapter Note

Built-in `vercel` and `netlify` targets support this V1 middleware contract today. Their current hosted support is compatibility for the built-in adapters, not a public adapter plugin API.
