# Hosted Adapter Behavior Confirmation (#193)

Date: 2026-07-04

Issue: <https://github.com/zenithbuild/framework/issues/193>

Scope: research and confirmation only. No adapter code, auth behavior, package manifests, public docs, or generated docs output were changed.

## Executive Summary

Vercel and Netlify hosted targets currently run server-authoritative page and resource route functions for direct requests. Guarded page routes still execute `guard(ctx)` before `load(ctx)` in the generated hosted functions, and denied/redirected routes return server responses rather than client-only decisions.

The hosted targets do not expose advisory `/__zenith/route-check`. The router bundle is emitted with route-check disabled for `target: "vercel"` and `target: "netlify"`, and the hosted output metadata does not include a route-check destination. This is a product and release-trust gap for soft-navigation UX, not a confirmed security bypass, because the direct HTML request remains server-authoritative.

Hosted `ctx.download()` support is not parity-complete. Direct resource routes that call `ctx.download()` are rejected at build time for Vercel and Netlify. The generated hosted function wrapper also contains a fallback that converts any response with `Content-Disposition` into a `501` response, but normal hosted builds should fail earlier for direct `ctx.download()` route source.

Live Vercel and Netlify deployments were not performed. The evidence below is local build/output inspection plus local execution of generated hosted function entrypoints.

## Sources Read

- `AGENTS.md`
- `docs/AGENTS.md`
- GitHub issue #193
- `docs/documentation/routing/route-protection.md`
- `docs/documentation/guides/deployment-targets.md`
- `packages/cli/src/adapters/adapter-vercel.ts`
- `packages/cli/src/adapters/adapter-netlify.ts`
- `packages/cli/src/adapters/hosted-adapter-context.ts`
- `packages/cli/src/adapters/validate-hosted-resource-routes.ts`
- `packages/cli/src/route-check-support.js`
- `packages/cli/src/dev-server/route-check.js`
- `packages/cli/src/preview/create-preview-server.js`
- `packages/cli/src/preview/request-handler.js`
- `packages/cli/src/server-runtime/node-server.js`
- `packages/cli/src/server-runtime/route-render.js`
- `packages/cli/src/server-contract/resolve.js`
- `packages/cli/src/resource-response.js`
- `packages/cli/src/download-result.js`
- `packages/router/template.js`
- `packages/router/template-navigation.js`
- Existing adapter/router tests under `packages/cli/tests/`

## Current Behavior Matrix

| Target/runtime | Guarded direct HTML request | Guarded soft navigation | Advisory route-check | `ctx.download()` resource route | Risk |
| --- | --- | --- | --- | --- | --- |
| Local dev, supported target | Server-owned `guard(ctx)` / `load(ctx)` | Route-check may preflight, then direct fetch commits or falls back | Available when target supports it | Supported by resource response path | Low |
| Local preview, supported target | Server-owned `guard(ctx)` / `load(ctx)` | Route-check may preflight, then direct fetch commits or falls back | Available when target supports it | Supported by resource response path | Low |
| Packaged `node` | Server-owned `guard(ctx)` / `load(ctx)` | Route-check may preflight, then direct fetch commits or falls back | Available | Supported, including attachment headers | Low |
| Hosted `vercel` | Server-owned generated function executes route runtime | Direct HTML fetch remains authority; no advisory hosted preflight | Not emitted/enabled | Build rejects direct resource downloads; wrapper has 501 fallback | Product/release-trust |
| Hosted `netlify` | Server-owned generated function executes route runtime | Direct HTML fetch remains authority; no advisory hosted preflight | Not emitted/enabled | Build rejects direct resource downloads; wrapper has 501 fallback | Product/release-trust |

## Behavior Confirmed

### Guarded soft navigation

The client router only treats route-check as an advisory preflight. When route-check is disabled, `requestRouteCheck()` returns `{ kind: "allow" }`, then the router fetches the target HTML directly with credentials. If the server returns a redirect, deny, non-HTML response, non-200 response, or fetch failure, the router falls back to browser navigation.

Confirmed from:

- `packages/router/template-navigation.js`
- `packages/router/template.js`
- `packages/cli/src/route-check-support.js`
- `packages/cli/tests/route-check-support.spec.js`

Hosted implication: Vercel/Netlify lose the earlier advisory UX signal, but they still rely on the direct server response before soft-committing HTML.

### Advisory route-check availability

`packages/cli/src/route-check-support.js` marks `vercel`, `netlify`, and `static-export` as unsupported route-check targets.

Local confirmation:

- Vercel build emitted router source with `__ZENITH_ROUTE_CHECK_ENABLED__ = false`.
- Netlify build emitted router source with `__ZENITH_ROUTE_CHECK_ENABLED__ = false`.
- Vercel `dist/config.json` did not mention `/__zenith/route-check`.
- Netlify `dist/publish/_redirects` did not mention `/__zenith/route-check`.
- Node build emitted router source with route-check enabled.
- Node server returned `200` for `/__zenith/route-check?path=%2Fsecure%3Fauth%3Dno` with a sanitized redirect result.

Existing tests also confirm that dev with `target: "vercel"` reports route-check as unsupported (`501`) instead of pretending route-check exists.

### Server-authoritative `guard(ctx)` / `load(ctx)` behavior

Hosted Vercel and Netlify generated route functions both call the shared runtime:

- page routes call `renderRouteRequest(...)`
- resource routes call `renderResourceRouteRequest(...)`
- both paths load the route module and execute `executeMatchedRoutePipeline(...)`

The shared pipeline runs `guard(ctx)` first, short-circuits on redirect/deny, and only runs `load(ctx)` after `guard(ctx)` allows the request.

Local generated-function confirmation:

- Vercel guarded route, `?auth=no`: `307`, `Location: /login`
- Vercel guarded route, `?auth=yes`: `200`, SSR payload `{ "viewer": "allowed", "query": "yes" }`
- Netlify guarded route, `?auth=no`: `307`, `Location: /login`
- Netlify guarded route, `?auth=yes`: `200`, SSR payload `{ "viewer": "allowed", "query": "yes" }`

Existing tests add cookie-session coverage for hosted page routes and resource routes:

- hosted page sign-in, redirect `Set-Cookie`, guarded reads, sign-out
- hosted resource `json`, `text`, redirect, deny, auth-cookie parity, multipart, stream, and SSE

### `ctx.download()` behavior

Node target supports resource downloads:

- `GET /api/export`: `200`
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="accounts.csv"; filename*=UTF-8''accounts.csv`
- body: `id,name\n1,Zenith\n`

Hosted Vercel and Netlify do not support resource downloads in this milestone:

- Build rejected a Vercel resource route containing `ctx.download(...)`.
- Build rejected a Netlify resource route containing `ctx.download(...)`.
- Error shape: `target "<target>" does not support resource downloads in this milestone. Route "/api/export" (...) must run on dev, preview, or target "node".`

The generated Vercel and Netlify function sources also contain a defensive runtime fallback that returns `501` if a resource route response has `Content-Disposition`. In normal direct `ctx.download(...)` usage, build-time validation fires before this fallback is reached.

## Exact Local Repro Steps

Execution note: the clean research worktree at `/Users/judahsullivan/zenith/framework-193-adapter-research` had no `node_modules` or built `packages/cli/dist`. The adapter tests and manual throwaway builds were run from `/Users/judahsullivan/zenith/framework`, which already had installed dependencies and built CLI artifacts. Before doing that, the relevant `packages/cli`, `packages/router`, and public routing/deployment docs paths were confirmed clean against `origin/master`; the dirty files in that checkout were unrelated `site/` and audit paths.

### Existing targeted tests

Run from a checkout with existing dependencies and built CLI artifacts:

```bash
cd /Users/judahsullivan/zenith/framework/packages/cli
node --experimental-vm-modules $(node -e "const path=require('node:path');const pkg=require.resolve('jest/package.json');process.stdout.write(path.join(path.dirname(pkg),'bin/jest.js'))") --config jest.config.js --forceExit --runInBand tests/route-check-support.spec.js tests/adapter-hosted-auth-parity.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-hosted-resource-validation.spec.js tests/adapter-platform-node.spec.js
```

Result:

```text
Test Suites: 5 passed, 5 total
Tests:       22 passed, 22 total
```

Expected console output includes server-error logging inside `adapter-platform-node.spec.js`; the suite still exits `0`.

### Manual hosted output confirmation

Run a throwaway project build with:

- `target: "vercel"`, `router: true`
- `target: "netlify"`, `router: true`
- guarded `/secure` page with `guard(ctx)` redirecting to `/login` unless `?auth=yes`

Observed output:

```json
[
  {
    "target": "vercel",
    "routeCheckInRouter": false,
    "outputMentionsRouteCheck": false,
    "deniedStatus": 307,
    "deniedLocation": "/login",
    "allowedStatus": 200,
    "allowedPayload": {
      "viewer": "allowed",
      "query": "yes"
    }
  },
  {
    "target": "netlify",
    "routeCheckInRouter": false,
    "outputMentionsRouteCheck": false,
    "deniedStatus": 307,
    "deniedLocation": "/login",
    "allowedStatus": 200,
    "allowedPayload": {
      "viewer": "allowed",
      "query": "yes"
    }
  }
]
```

### Manual hosted download confirmation

Run throwaway Vercel and Netlify builds with a resource route:

```ts
export async function load(ctx) {
  return ctx.download("id,name\n1,Zenith\n", {
    filename: "accounts.csv",
    contentType: "text/csv; charset=utf-8"
  });
}
```

Observed output:

```text
[Zenith:Build] target "vercel" does not support resource downloads in this milestone. Route "/api/export" (...) must run on dev, preview, or target "node".
[Zenith:Build] target "netlify" does not support resource downloads in this milestone. Route "/api/export" (...) must run on dev, preview, or target "node".
```

### Manual node parity confirmation

Run a throwaway `target: "node"`, `router: true` build with the same guarded page and a resource download.

Observed output:

```json
{
  "target": "node",
  "routeCheckInRouter": true,
  "deniedStatus": 307,
  "deniedLocation": "/login",
  "allowedStatus": 200,
  "routeCheckStatus": 200,
  "routeCheckBody": {
    "result": {
      "kind": "redirect",
      "location": "/login",
      "status": 307
    },
    "routeId": "secure"
  },
  "downloadStatus": 200,
  "downloadContentType": "text/csv; charset=utf-8",
  "downloadContentDisposition": "attachment; filename=\"accounts.csv\"; filename*=UTF-8''accounts.csv",
  "downloadBody": "id,name\n1,Zenith\n"
}
```

## Live Hosted Deployment Status

Live Vercel and Netlify deployments were not tested.

This report confirms:

- generated hosted output shape
- generated hosted function behavior when imported and called locally
- router route-check emission settings
- build-time hosted download rejection
- existing adapter test coverage

This report does not confirm:

- actual Vercel production/request wrapper behavior
- actual Netlify production/request wrapper behavior
- provider-specific redirect/header/cookie quirks beyond local generated-function execution
- deployed edge/function logs

## Risk Classification

### Route-check absence on hosted targets

Risk: product risk and release-trust risk.

Not confirmed as a security risk. Route-check is advisory and skipped for hosted targets; the direct same-origin HTML request remains server-authoritative. The security boundary remains `guard(ctx)` / `load(ctx)` on the server response path.

### Hosted `ctx.download()` gap

Risk: product parity risk.

Not a confirmed security risk. Hosted downloads are rejected during build for direct `ctx.download(...)` resource routes, and generated hosted wrappers defensively return `501` if a download-shaped response reaches them.

### Live provider gap

Risk: release-trust risk.

Local generated-function execution is strong evidence for framework output, but not a substitute for one real Vercel deployment and one real Netlify deployment before claiming hosted parity in release notes.

## Recommended Follow-up Issues

1. Decide hosted route-check parity scope for Vercel and Netlify.
   - Type: decision/implementation follow-up.
   - Scope choice: keep route-check intentionally deferred with clearer docs, or add hosted route-check functions/routes for Vercel and Netlify.

2. Clarify hosted download wording.
   - Type: docs/maintenance.
   - Current public docs say hosted `ctx.download()` returns `501`; actual direct route behavior is build rejection, with a generated wrapper-level `501` fallback.

3. Add live hosted smoke coverage before advertising full hosted parity.
   - Type: release/test.
   - One minimal Vercel deploy and one minimal Netlify deploy should cover guarded page redirect/allow, route-check absence or availability, cookie header roundtrip, and a resource route.

4. Keep `ctx.download()` hosted implementation separate from route-check.
   - Type: implementation.
   - Downloads have different platform constraints and should not be bundled into route-check parity unless #192 explicitly chooses that combined milestone.

## Whether #192 Can Be Decided

Yes, #192 can now be decided at the product-scope level.

The evidence supports this decision framing:

- Hosted Vercel/Netlify direct server route execution already works for guarded pages and resource routes.
- Hosted Vercel/Netlify advisory route-check is intentionally absent today.
- Hosted resource downloads are not parity-complete and are rejected for direct `ctx.download(...)` routes.
- The route-check gap is currently a UX/product trust gap, not a demonstrated security bypass.

#192 should not claim live provider parity is fully proven until actual Vercel and Netlify deployments are tested.

## Recommended #192 Decision Prompt

Choose one hosted adapter trust milestone:

1. Minimal trustworthy hosted target docs: keep route-check and downloads deferred, document the exact current behavior, and add live hosted smoke notes.
2. Route-check parity milestone: implement hosted advisory route-check for Vercel and Netlify, leaving downloads deferred.
3. Broader hosted parity milestone: implement hosted route-check and hosted downloads together.

Recommendation: choose option 2. Route-check parity is the smallest feature gap that directly affects guarded soft-navigation trust. Downloads should remain a separate milestone because their platform constraints and response-body semantics differ from route-check.

## Validation Commands Run

```bash
cd /Users/judahsullivan/zenith/framework/packages/cli
node --experimental-vm-modules $(node -e "const path=require('node:path');const pkg=require.resolve('jest/package.json');process.stdout.write(path.join(path.dirname(pkg),'bin/jest.js'))") --config jest.config.js --forceExit --runInBand tests/route-check-support.spec.js tests/adapter-hosted-auth-parity.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-hosted-resource-validation.spec.js tests/adapter-platform-node.spec.js
```

Result: passed, 5 suites and 22 tests.

```bash
cd /Users/judahsullivan/zenith/framework-193-adapter-research
git diff --check
node scripts/file-size-audit.mjs --allowlist docs/maintainability/file-size-allowlist.json --enforce --max-lines 500 --git-diff-base origin/master --print-limit 120
```

Result: both passed. The file-size audit considered `0` changed tracked files because the new report is still untracked.
