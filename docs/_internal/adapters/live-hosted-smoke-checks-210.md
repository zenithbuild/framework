# Live Hosted Adapter Smoke Checks (#210)

Date: 2026-07-05

Issue: <https://github.com/zenithbuild/framework/issues/210>

Status: runbook and reusable probe added. Live Vercel and Netlify deployments were not run in this Codex environment because neither provider CLI was available locally. Live execution remains pending.

## Purpose

This runbook is the live-provider verification layer after #211 added hosted advisory route-check parity for `vercel` and `netlify`.

It must not be treated as route-check implementation work. It exists to prove provider behavior before Zenith claims full hosted parity in public release notes or public docs.

## Security Boundary

The security boundary remains server-side `guard(ctx)` / `load(ctx)` execution on direct requests.

`/__zenith/route-check` is advisory soft-navigation UX only. A passing smoke check does not turn route-check into authorization.

## What Must Be Verified

- Guarded direct page request redirects when denied.
- Guarded direct page request renders when allowed.
- Hosted `/__zenith/route-check` routes to the emitted provider function.
- Route-check returns sanitized redirect JSON for denied guarded routes.
- Route-check returns `allow` for allowed guarded routes.
- Route-check rejects requests without `x-zenith-route-check: 1`.
- Route-check excludes resource routes from soft-navigation preflight.
- Hosted downloads remain unsupported: direct `ctx.download()` resource routes fail hosted builds, and no download implementation is added.
- Provider-specific quirks, headers, redirects, logs, and cleanup steps are recorded.

## Minimal Smoke Fixture

Create a throwaway app outside the repository or in a disposable temp directory. Do not commit provider project ids, deployment URLs, or tokens.

```text
live-hosted-smoke/
  pages/
    index.zen
    login.zen
    secure/
      index.zen
    api/
      ping.resource.ts
  zenith.config.js
```

`pages/index.zen`:

```zen
<main>
  <h1>Hosted smoke</h1>
  <a data-zen-link href="/secure?auth=no" data-smoke-denied>Denied soft nav</a>
  <a data-zen-link href="/secure?auth=yes" data-smoke-allowed>Allowed soft nav</a>
</main>
```

`pages/login.zen`:

```zen
<main>Login</main>
```

`pages/secure/index.zen`:

```zen
<script server lang="ts">
export async function guard(ctx) {
  if (ctx.url.searchParams.get("auth") !== "yes") {
    return ctx.redirect("/login?next=" + encodeURIComponent(ctx.url.pathname + ctx.url.search), 307);
  }
  return ctx.allow();
}

export async function load(ctx) {
  return ctx.data({ ok: true });
}
</script>

<main>Secure</main>
```

`pages/api/ping.resource.ts`:

```ts
export async function load(ctx) {
  return ctx.json({ ok: true });
}
```

Use a base path to verify hosted route-check base-path handling:

```js
module.exports = {
  target: "vercel",
  outDir: ".vercel/output",
  basePath: "/docs",
  router: true,
  typescriptDefault: true
};
```

For Netlify, change `target` and `outDir`:

```js
module.exports = {
  target: "netlify",
  outDir: "dist",
  basePath: "/docs",
  router: true,
  typescriptDefault: true
};
```

## Local Build Inspection

Run the build with the local Zenith CLI under test. Example from a framework checkout with `packages/cli` built:

```bash
node /path/to/framework/packages/cli/dist/index.js build
```

Vercel output checks:

```bash
test -f .vercel/output/config.json
test -f .vercel/output/functions/__zenith/route-check.func/index.js
node -e "const c=require('./.vercel/output/config.json'); console.log(c.routes)"
```

Expected Vercel route metadata includes a route equivalent to:

```json
{ "src": "^/docs/__zenith/route\\-check/?$", "dest": "/__zenith/route-check" }
```

Netlify output checks:

```bash
test -f dist/netlify.toml
test -f dist/publish/_redirects
test -f dist/functions/__zenith_route_check.mjs
grep '/docs/__zenith/route-check /.netlify/functions/__zenith_route_check 200!' dist/publish/_redirects
```

## Live Vercel Smoke

Prerequisites:

- Vercel CLI is installed and authenticated.
- The smoke app uses `target: "vercel"` and `outDir: ".vercel/output"`.
- No provider token, team id, project id, or deployment URL is committed.

Commands:

```bash
node /path/to/framework/packages/cli/dist/index.js build
vercel deploy --prebuilt
```

After the CLI prints a deployment URL, run:

```bash
node /path/to/framework/scripts/live-hosted-adapter-smoke.mjs \
  --provider vercel \
  --base-url https://example-vercel-deployment.vercel.app \
  --base-path /docs
```

Record:

- exact Zenith commit
- exact build command
- Vercel CLI version
- deployment URL
- probe output
- provider logs for route-check and guarded direct requests
- cleanup command or dashboard deletion confirmation

## Live Netlify Smoke

Prerequisites:

- Netlify CLI is installed and authenticated.
- The smoke app uses `target: "netlify"` and `outDir: "dist"`.
- No provider token, site id, team id, or deployment URL is committed unless it is a placeholder.

Commands:

```bash
node /path/to/framework/packages/cli/dist/index.js build
netlify deploy --dir dist/publish --functions dist/functions
```

After the CLI prints a deployment URL, run:

```bash
node /path/to/framework/scripts/live-hosted-adapter-smoke.mjs \
  --provider netlify \
  --base-url https://example-netlify-deployment.netlify.app \
  --base-path /docs
```

Record:

- exact Zenith commit
- exact build command
- Netlify CLI version
- deployment URL
- probe output
- provider logs for route-check and guarded direct requests
- cleanup command or dashboard deletion confirmation

## Hosted Download Negative Check

Do not add a `ctx.download()` route to the deployed smoke app; hosted builds should reject it.

Use a separate local negative check by adding this throwaway route to a copy of the fixture:

```ts
export async function load(ctx) {
  return ctx.download("id,name\n1,Zenith\n", {
    filename: "accounts.csv",
    contentType: "text/csv; charset=utf-8"
  });
}
```

Expected build result for both `target: "vercel"` and `target: "netlify"`:

```text
target "<provider>" does not support resource downloads in this milestone
```

This is product parity work, not a confirmed security bypass, and remains separate from hosted route-check.

## Pass/Fail Checklist

For each provider, mark every row with pass, fail, or not run.

| Check | Vercel | Netlify | Notes |
| --- | --- | --- | --- |
| Local build produces provider route-check metadata | pending | pending | |
| Live deployment completed | pending | pending | |
| Direct denied `/docs/secure?auth=no` returns redirect to login | pending | pending | |
| Direct allowed `/docs/secure?auth=yes` returns `200` page HTML | pending | pending | |
| `/docs/__zenith/route-check` returns redirect result for denied route | pending | pending | |
| `/docs/__zenith/route-check` returns allow result for allowed route | pending | pending | |
| Route-check without internal header returns `403` | pending | pending | |
| Route-check against `/docs/api/ping` returns `404 route_not_found` | pending | pending | |
| Hosted download negative build still fails | pending | pending | |
| Provider logs inspected for unexpected runtime errors | pending | pending | |
| Deployment cleaned up or intentionally retained | pending | pending | |

## Current Execution Status

Live execution was not performed in this Codex run:

- `vercel` CLI: not found on `PATH`
- `netlify` CLI: not found on `PATH`

#210 should remain pending live execution until at least one real Vercel deployment smoke and one real Netlify deployment smoke pass and the results are recorded.
