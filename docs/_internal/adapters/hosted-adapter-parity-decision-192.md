# Hosted Adapter Parity Decision (#192)

Date: 2026-07-04

Issue: <https://github.com/zenithbuild/framework/issues/192>

Input evidence:

- GitHub issue #192
- GitHub issue #193
- `docs/_internal/adapters/hosted-adapter-behavior-193.md`
- `docs/documentation/routing/route-protection.md`
- `docs/documentation/guides/deployment-targets.md`

Branch note: #207 had not landed when this decision was finalized, so this branch is stacked on the #207 head commit. This document depends on the #193 report and the corrected public hosted-download docs from #207, but it does not duplicate or rewrite the #193 report.

## Decision

Implement advisory route-check parity for hosted `vercel` and `netlify` as the next hosted adapter milestone.

Defer hosted `ctx.download()` parity into a separate milestone and issue.

Do not claim full live hosted parity in public docs or release notes until one real Vercel deployment smoke test and one real Netlify deployment smoke test pass.

## Rationale

#193 confirmed that hosted Vercel and Netlify direct requests already execute server-side `guard(ctx)` / `load(ctx)` through generated hosted functions. The missing route-check endpoint is therefore not a confirmed security bypass. It is a product trust and soft-navigation UX gap: local dev, preview, and packaged `node` expose the advisory preflight, while hosted Vercel and Netlify do not.

Hosted downloads are a different problem. #193 confirmed that direct resource routes using `ctx.download()` are rejected at build time for Vercel and Netlify, with a generated wrapper-level `501` fallback if a download-shaped response reaches hosted output. #207 updated the public deployment docs to say that directly. Hosted downloads remain product parity work, but they have different platform constraints than route-check and should not block advisory route-check parity.

## Current Behavior

### Works Today

- Hosted `vercel` and `netlify` page routes execute generated server functions for direct requests.
- Hosted direct page requests run `guard(ctx)` before `load(ctx)`.
- Hosted direct guarded page requests return server redirects or denies instead of relying on client-only decisions.
- Hosted resource routes support JSON, text, redirects, denies, multipart form data, stream, SSE, and cookie-session behavior covered by existing tests.
- Packaged `node` supports advisory route-check and resource downloads.
- Local dev and local preview expose route-check when the selected target supports it.

### Missing Today

- Hosted `vercel` and `netlify` do not emit advisory `/__zenith/route-check`.
- Hosted router output is emitted with route-check disabled for `target: "vercel"` and `target: "netlify"`.
- Hosted output metadata does not route `/__zenith/route-check` to a hosted function.
- Hosted `ctx.download()` resource routes are not accepted for direct Vercel/Netlify builds.
- Live Vercel and Netlify provider behavior has not been proven by deployed smoke tests.

## Security Boundary vs Advisory UX

The security boundary remains the server-rendering pipeline:

- `guard(ctx)` is server-authoritative.
- `load(ctx)` runs only after `guard(ctx)` allows.
- Server redirects and denies decide direct request behavior.
- Client-side route-check is not authorization.
- Client-side policy hooks are advisory UX only.

Advisory route-check exists to avoid route transition flashes and expose earlier route events during soft navigation. It should mirror guard-only route preflight behavior where supported, but it must not become a second authorization system.

Hosted route-check parity should keep the same model:

- guard-only evaluation
- same-origin target path validation
- explicit `x-zenith-route-check: 1` header requirement
- sanitized redirect/deny result payloads
- no client-only guard model
- no OAuth, RBAC, session-store, or auth-provider abstraction

## Route-check Decision

Route-check parity should be implemented now.

Reason:

- It is the smallest hosted adapter milestone that closes the most visible parity gap.
- It aligns hosted Vercel/Netlify soft-navigation behavior with local dev, preview, and packaged `node`.
- It improves product trust without changing the server security boundary.
- It can be tested with generated hosted output and later verified with live provider smoke tests.

The implementation issue should focus only on hosted advisory route-check emission and behavior for Vercel and Netlify.

## Download Decision

Hosted downloads should be deferred.

Reason:

- Downloads are resource-response capability work, not soft-navigation guard preflight work.
- Hosted platforms may have response body, streaming, header, binary payload, and function-wrapper constraints that do not apply to route-check.
- Combining downloads with route-check would turn the next milestone into a broad hosted parity branch.
- The current hosted behavior is explicit: direct `ctx.download()` resource routes fail the build, and generated wrappers include a defensive `501` fallback.

The download follow-up should remain a separate implementation issue after route-check parity is scoped.

## Required Tests Before Claiming Hosted Parity

### Before merging route-check implementation

- Vercel build emits a route-check function or equivalent hosted endpoint.
- Netlify build emits a route-check function or equivalent hosted endpoint.
- Vercel output routes `/__zenith/route-check` through the hosted route-check function, including `basePath`.
- Netlify output routes `/__zenith/route-check` through the hosted route-check function, including `basePath`.
- Hosted route-check requires `x-zenith-route-check: 1`.
- Hosted route-check rejects external, protocol-relative, or malformed paths.
- Hosted route-check returns sanitized redirect and deny payloads.
- Hosted route-check evaluates guarded page routes in guard-only mode.
- Hosted route-check does not treat resource routes as soft-navigation HTML targets.
- Router output enables route-check only when the hosted endpoint is emitted.
- Existing direct hosted `guard(ctx)` / `load(ctx)` behavior remains unchanged.
- Existing hosted resource behavior remains unchanged.

### Before public docs or release notes claim hosted parity

- One real Vercel deployment smoke test passes.
- One real Netlify deployment smoke test passes.
- Each live smoke covers:
  - guarded page direct request redirect
  - guarded page direct request allow
  - advisory route-check redirect or deny
  - advisory route-check allow
  - cookie/header behavior for guarded routes where applicable
  - base-path route-check behavior if the milestone claims base-path support
- Live smoke results are recorded in an internal report or release checklist.

## Follow-up Implementation Issues

### 1. Implement hosted advisory route-check for Vercel and Netlify

Type: implementation

Scope:

- Add hosted route-check output for Vercel and Netlify.
- Use the existing guard-only route-check semantics.
- Preserve server-authoritative direct request behavior.
- Preserve current global middleware exclusion from route-check unless a separate decision changes that contract.
- Add adapter/router tests for emitted endpoint routing, base path, sanitized results, and unsupported/malformed requests.

Out of scope:

- `ctx.download()` support
- auth model changes
- client-only route guards
- generic adapter plugin work
- broad adapter rewrite

### 2. Add live hosted smoke runbook or check for route-check parity

Type: release/test

Scope:

- Document exact deploy commands or manual steps for one Vercel and one Netlify smoke.
- Cover direct guarded requests and route-check requests.
- Record expected status codes, headers, and sanitized JSON payloads.

Out of scope:

- Making live hosted smoke mandatory for every local test run
- Adding provider secrets to local development assumptions

### 3. Defer hosted downloads into a separate parity issue

Type: decision/implementation follow-up

Scope:

- Decide whether hosted downloads should be supported on Vercel and Netlify.
- Define body size, binary, streaming, header, and platform-wrapper constraints.
- Replace build rejection only after the hosted response path is proven.

Out of scope:

- Route-check parity
- route protection semantics
- generic file-serving helpers
- arbitrary `Response` escape hatch

## Remains Out of Scope

- Adapter fixes in this decision branch
- Router behavior changes in this decision branch
- Client-only guards
- Auth behavior changes
- OAuth, RBAC, session-store, or provider abstraction
- Combining route-check parity and downloads into one implementation issue
- Claiming a confirmed security bypass from current hosted route-check absence
- Claiming live hosted parity before real Vercel and Netlify smoke tests pass
- #205 compiler JS bridge fallback semantics

## Implementation Start Recommendation

Implementation should begin after this decision is reviewed and accepted.

The first implementation PR should be route-check-only. Downloads should not block it.
