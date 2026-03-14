---
title: "Routing Contract"
description: "Canonical Phase 0 server-routing contract: manifest truth, deterministic precedence, direct-request execution order, and 404/redirect/error outcomes."
version: "0.3"
status: "canonical"
last_updated: "2026-03-12"
tags: ["routing", "manifest", "contracts"]
---

# Routing Contract

## Contract: Server Route Resolution

Contract: server routing is authoritative in dev, preview, and production.

Invariant: route selection is derived from the generated route manifest using the request pathname only.

Invariant: `ctx.params` reflects the matched route, including catch-all params joined with `/`.

### Route Shapes

- `index.zen` -> `/`
- `about.zen` -> `/about`
- `[id].zen` -> `:id`
- `[...slug].zen` -> `*slug`
- `[[...slug]].zen` -> `*slug?`

### Deterministic Precedence

Zenith sorts and matches routes with one precedence ladder:

1. Static segments beat dynamic param segments.
2. Dynamic param segments beat catch-all segments.
3. More specific segment weights win left-to-right.
4. If weights still tie, routes with more segments win.
5. If specificity still ties, lexicographic path order is used.

Result: static > param > catch-all, with deterministic ordering inside each tier.

### Conflict Rejection

Manifest generation rejects:

- Duplicate concrete routes such as `docs.zen` and `docs/index.zen`.
- Structurally ambiguous routes such as `users/[id].zen` and `users/[slug].zen`.
- Structurally ambiguous catch-alls such as `docs/[...slug].zen` and `docs/[...all].zen`.
- Repeated param names inside one route.
- Non-terminal catch-all segments.

## Contract: Route Identity

Contract: server route identity is pathname-derived and does not depend on client-only state.

Invariant: route identity is the matched route metadata plus params:

- `route.id`
- `route.pattern`
- `route.file`
- `params`

### Path Normalization Rules

- Trailing slashes do not change the matched route.
- Repeated empty path segments are collapsed during matching.
- Encoded path segments remain encoded for param extraction.
- Query string does not participate in route selection.
- Hash fragments do not reach the server and are not part of route identity.

Query data is still available to `guard(ctx)` and `load(ctx)` through `ctx.url.searchParams`.

## Contract: Direct Request Execution

Contract: on a matched non-prerender route, the server evaluates route data for every direct request before HTML is returned.

Execution order:

1. Resolve the route from the manifest using the request pathname.
2. If the route has a server module, run `guard(ctx)` first when present.
3. If `guard(ctx)` returns `allow()`, run `load(ctx)` when present.
4. If no `load(ctx)` exists, use `data`, then legacy `ssr_data` / `props` / `ssr`, then `{}`.
5. Inject the resolved payload into HTML and return the matched page.

### Server Module Sources

Zenith accepts route server logic from:

- One `<script server lang="ts">` block in the `.zen` page.
- Adjacent sibling modules named `<route>.guard.ts` / `<route>.load.ts`.
- For `index.zen` routes, `page.guard.ts` / `page.load.ts` in the same directory are also accepted.

Inline and adjacent `guard` or `load` definitions may not duplicate each other. Inline `data` or legacy payload exports may not be combined with an adjacent `load`.

### Data Freshness

- Non-prerender routes evaluate server data on every direct request.
- Prerendered routes use the build-time server payload snapshot embedded in the output HTML.
- `guard(ctx)` and `load(ctx)` cannot be combined with `prerender = true`.

## Contract: Redirect, Deny, Error, and 404 Outcomes

### Redirect

If a matched route returns `redirect(location, status?)`:

- `guard(ctx)` or `load(ctx)` short-circuits rendering.
- Zenith returns the provided 3xx status.
- Zenith returns the `Location` header exactly as supplied by the route result.
- Query and hash are preserved only if the route author includes them in `location`.

Zenith does not perform automatic canonical-path redirects.

### Deny

If a matched route returns `deny(status, message?)`:

- Allowed user-authored statuses are `401`, `403`, and `404`.
- Rendering is skipped.
- Zenith returns the matched route status with a plain-text body.
- Default body text is status-based when `message` is omitted.

A matched-route `deny(404, ...)` is not the same as an unmatched 404.

### Unmatched 404

Unmatched 404 is chosen only after:

1. No manifest route matches the request pathname.
2. No static file output resolves for the request path.

Catch-all routes participate before unmatched 404. If a catch-all matches, the request is no longer “unmatched”.

### Server Execution Failures

There are two server failure classes today:

- If `guard(ctx)` or `load(ctx)` throws after the route module is executing, Zenith returns `500 text/plain`.
- If Zenith cannot produce a canonical route result from the extracted server module at all, it injects a `__zenith_error` payload with code `LOAD_FAILED` into the matched HTML response.

This distinction is implementation truth today and is part of the direct-load contract client routing must account for later.

### Dev / Preview Difference

- Dev returns diagnostic HTML or JSON for unmatched 404s.
- Preview returns plain `404 Not Found` text for unmatched 404s.
- Redirect, deny, route precedence, params, and matched-route execution semantics must stay identical.

## Contract: Manifest / Server Parity

Contract: manifest generation, built route metadata, preview resolution, and dev resolution must agree.

Definition of Done:

- Dev and preview resolve the same route pattern and params for the same pathname.
- Manifest precedence matches runtime request precedence.
- Route metadata used for direct server execution is stable across environments.

Evidence:

- `packages/cli/tests/manifest.spec.js`
- `packages/cli/tests/resolve-request-route.spec.js`
- `packages/cli/tests/ssr-routes-smoke.spec.js`
- `packages/cli/tests/server-routing-contract.spec.js`

## Contract: Navigation Defaults

Contract: default `<a href>` keeps browser hard navigation.

Invariant: client-side soft navigation is opt-in only via `data-zen-link`.

Phase 0 scope note: client routing is not authority. Any future client router must mirror the server contract above instead of redefining it.
