# A2 Hosted Adapter Preflight Audit

Issue: #116

Status: pre-implementation audit only. This document does not approve adapter
implementation work and does not change adapter behavior.

## Goal

Prepare A2 by deciding how the built-in Vercel and Netlify hosted adapters can
move behind the normalized internal adapter contract from A1 without changing
output layout, hosted runtime packaging, route behavior, middleware semantics, or
public adapter APIs.

A1 established that the internal adapter context must keep raw adapter names
representable. A2 should preserve that rule while normalizing only framework-owned
built-in adapter internals.

## Non-goals

- No public adapter plugin API.
- No `zenith.config.js` adapter plugin API.
- No adapter lifecycle hooks.
- Unsupported/future-scoped: no `zenith adapter add` command.
- No plugin add, remove, create, install, or config mutation commands.
- No package-manager detection.
- No middleware semantic changes.
- No route authorization, auth signing, session, compiler, server contract, or
  route result validation changes.
- No output layout changes.
- No hosted runtime packaging changes.
- No JavaScript middleware support.
- No TypeScript migration in this preflight artifact.

## Files inspected

- `docs/plans/A1_INTERNAL_ADAPTER_INTERFACE_PLAN.md`
- `packages/cli/src/adapters/adapter-types.ts`
- `packages/cli/src/adapters/resolve-adapter.ts`
- `packages/cli/src/adapters/adapter-vercel.ts`
- `packages/cli/src/adapters/adapter-netlify.ts`
- `packages/cli/src/adapters/adapter-vercel-static.ts`
- `packages/cli/src/adapters/adapter-netlify-static.ts`
- `packages/cli/src/adapters/adapter-node.js`
- `packages/cli/src/adapters/copy-hosted-page-runtime.js`
- `packages/cli/src/adapters/route-rules.js`
- `packages/cli/src/adapters/validate-hosted-resource-routes.js`
- `packages/cli/tests/adapter-config.spec.js`
- `packages/cli/tests/adapter-platform-server.spec.js`
- `packages/cli/tests/adapter-platform-static.spec.js`
- `packages/cli/tests/adapter-hosted-resource-parity.spec.js`
- `packages/cli/tests/adapter-hosted-auth-parity.spec.js`
- `packages/cli/tests/adapter-hosted-image-parity.spec.js`
- `packages/cli/tests/global-middleware-runtime-hosted.spec.js`
- `packages/cli/tests/scoped-server-hosted-runtime.spec.js`
- `packages/cli/tests/security-regression-gates.spec.js`
- `packages/cli/tests/server-output-contract.spec.js`

## Current hosted adapter surface

The Vercel and Netlify hosted targets currently use the existing `AdapterDriver`
shape from `adapter-types.ts`:

```ts
interface AdapterDriver {
  name: string;
  validateRoutes: (manifest: AdapterRouteManifest) => void;
  adapt: (options: AdaptOptions) => Promise<void>;
}
```

`resolveBuildAdapter()` resolves built-in targets and raw advanced adapters into
that shape. Raw adapter names remain arbitrary strings today, and A2 must not
turn those names into a built-in-only union.

### Vercel hosted target

`adapter-vercel.ts` is already authored TypeScript. It owns:

- hosted resource route validation
- server manifest loading from `.zenith-output/server/manifest.json`
- `.vercel/output`-style function and static layout under `dist`
- per-route `.func` generation
- image function generation
- hosted global middleware runtime copying
- hosted scoped server data copying
- `config.json` route metadata and function config

### Netlify hosted target

`adapter-netlify.ts` is already authored TypeScript. It owns:

- hosted resource route validation
- server manifest loading from `.zenith-output/server/manifest.json`
- publish/functions layout under `dist`
- per-route function generation
- image function generation
- hosted global middleware runtime copying
- hosted scoped server data copying
- `_redirects` and `netlify.toml` metadata

### Shared hosted helpers

The hosted adapters both depend on authored JavaScript helper files:

- `copy-hosted-page-runtime.js`
- `route-rules.js`
- `validate-hosted-resource-routes.js`

These files are the likely A2 blocker because #116 explicitly says not to patch
authored adapter `.js` files in place and not to create new authored `.js`
implementation files.

### Static variants

`adapter-vercel-static.ts` and `adapter-netlify-static.ts` are already authored
TypeScript. They are related adapter targets but do not share the hosted function
packaging surface. A2 should not change static variant behavior unless explicitly
approved as part of the implementation slice.

## Adapter JS files requiring a migration decision

| File | Role | A2 recommendation |
| --- | --- | --- |
| `packages/cli/src/adapters/copy-hosted-page-runtime.js` | Copies hosted page runtime, image runtime, global middleware runtime, and scoped server data support files | Migrate to TypeScript in a dedicated no-behavior-change slice before normalizing hosted adapter calls |
| `packages/cli/src/adapters/route-rules.js` | Builds hosted base-path, image, asset, and route rewrite rules | Migrate to TypeScript in the same helper migration slice if A2 touches route rule plumbing |
| `packages/cli/src/adapters/validate-hosted-resource-routes.js` | Rejects unsupported hosted resource route download behavior | Migrate to TypeScript before changing validation call shape |
| `packages/cli/src/adapters/adapter-node.js` | Node adapter implementation and packaging reference | Do not touch for A2 unless a separately approved normalization slice includes Node |

The top-level Vercel and Netlify hosted implementation files are already
TypeScript. A2 will still need to touch them, but that does not resolve the
shared helper JS blocker.

## Current parity coverage

| Required area | Current coverage | Gap |
| --- | --- | --- |
| Vercel hosted resource parity | `adapter-hosted-resource-parity.spec.js` runs Vercel resource json/text/redirect/deny/auth, downloads, multipart, streaming, and SSE cases | No A2-specific assertion that a normalized context is the source of route metadata |
| Netlify hosted resource parity | `adapter-hosted-resource-parity.spec.js` runs the same target matrix for Netlify | Same implementation-specific gap |
| Vercel hosted auth parity | `adapter-hosted-auth-parity.spec.js` covers hosted page-route sign-in, guarded reads, redirect cookies, and sign-out | No exhaustive output tree snapshot |
| Netlify hosted auth parity | `adapter-hosted-auth-parity.spec.js` covers the same matrix for Netlify | No exhaustive output tree snapshot |
| Vercel hosted image parity | `adapter-hosted-image-parity.spec.js` covers hosted image endpoint wiring, base-path routing, and node-parity headers | No A2-specific context assertion |
| Netlify hosted image parity | `adapter-hosted-image-parity.spec.js` covers the same matrix for Netlify | No A2-specific context assertion |
| Vercel hosted global middleware parity | `global-middleware-runtime-hosted.spec.js` covers page/resource execution, image function wiring, missing middleware output, invalid middleware default export, and unsafe copy paths | Helper migration should keep these tests mandatory |
| Netlify hosted global middleware parity | `global-middleware-runtime-hosted.spec.js` covers the same target matrix for Netlify | Helper migration should keep these tests mandatory |
| Output path parity | `adapter-platform-server.spec.js`, `adapter-platform-static.spec.js`, and hosted parity suites assert key function, runtime, static, publish, config, and redirect paths | Missing one focused A2 tree-manifest or path-list parity test for Vercel/Netlify hosted output |
| Route result/auth/security drift | `adapter-platform-server.spec.js`, `adapter-hosted-resource-parity.spec.js`, `adapter-hosted-auth-parity.spec.js`, `security-regression-gates.spec.js`, and `server-output-contract.spec.js` cover current route/auth/security contracts | A2 should rerun these unchanged and add no new security ownership to adapters |
| Scoped server data hosted parity | `scoped-server-hosted-runtime.spec.js` covers hosted scoped payloads, repeated component props, redirect/deny short-circuiting, owner errors, and missing scoped modules | Keep in A2 validation because hosted runtime copying includes scoped data |
| Raw adapter compatibility | `adapter-config.spec.js` covers built-in target resolution, target/adapter exclusivity, and raw custom adapter names | A2 should preserve arbitrary `adapterName: string` and avoid narrowing raw adapter names |

## Comparison with A1

A1 proposed an internal-only adapter context with:

- `adapterName: string`
- `target: string`
- optional `builtInTarget?: InternalAdapterTarget`
- explicit build, route, and server manifests
- explicit capabilities
- separate route validation and output adaptation phases

The current hosted adapters partly match this direction because build already
passes `coreOutput`, `outDir`, `manifest`, and `config` through `AdaptOptions`.
They do not yet match A1 because:

- hosted adapters rediscover the server manifest from disk instead of receiving
  it as an explicit context input
- capabilities are implicit in each adapter implementation
- validation receives `AdapterRouteManifest`, while adaptation receives
  `BuildManifest`
- hosted runtime copy behavior is shared through authored JavaScript helpers
- output path parity is tested through important assertions, but not through a
  dedicated A2 path-list parity fixture

## Recommended A2 implementation path

Choose #116 path 2 for implementation:

> dedicated TypeScript migration scope for touched adapter files, with output
> parity tests

Path 1 is correct for this preflight PR only. Path 3, a temporary narrow JS edit,
is not recommended because the likely touched helper files are central to hosted
runtime packaging and already have broad parity coverage. Migrating those helpers
first is lower-risk than changing their call shapes while keeping them authored
JavaScript.

Recommended future slicing:

1. **A2A helper migration**
   - Move `copy-hosted-page-runtime.js`, `route-rules.js`, and
     `validate-hosted-resource-routes.js` to TypeScript without behavior changes.
   - Keep public exports compatible with existing tests.
   - Add a Vercel/Netlify hosted output path-list parity test before changing
     adapter context flow.
2. **A2B hosted normalization**
   - Introduce the internal normalized context for Vercel and Netlify hosted
     adapters only.
   - Pass explicit server manifest data instead of rediscovering it inside each
     adapter.
   - Preserve `target: string`, `adapterName: string`, and optional
     `builtInTarget` so raw adapter compatibility remains intact.
3. **A2C static variant decision**
   - Decide whether `vercel-static` and `netlify-static` should move behind the
     same normalized driver in the same issue or remain a separate small slice.

Do not migrate Node, static, or static-export behavior in the same PR unless
explicitly approved after A2B passes.

## A2 hard stops

Stop A2 implementation if any step requires:

- changing Vercel or Netlify output paths
- changing function source request handling
- changing image endpoint behavior
- changing hosted resource validation semantics
- moving middleware ownership into adapters
- treating `adapterName` or raw `target` as a built-in-only union
- changing raw advanced adapter config behavior
- changing public docs to advertise delegated adapter plugins
- touching authored JavaScript adapter files without a TypeScript migration path

## Risks

- Hosted deployments are path-sensitive; small layout drift can break real
  projects even when local runtime tests pass.
- Generated function source strings are hard to refactor safely without output
  parity coverage.
- Server manifest loading changes can accidentally affect scoped server data,
  image routing, auth, or global middleware packaging.
- Internal capabilities could look like a public plugin contract if names and
  docs are not scoped carefully.
- Static hosted variants can be conflated with dynamic hosted adapters unless the
  A2 slice names the target set explicitly.

## Validation for this A2 preflight artifact

This PR should remain docs-only planning work:

```sh
cd /Users/judahsullivan/Personal/framework/docs
bun run docs:gate

cd /Users/judahsullivan/Personal/framework/packages/cli
bun run test -- tests/public-contract-truth.spec.js

cd /Users/judahsullivan/Personal/framework
git diff --check
node ./scripts/file-size-audit.mjs --allowlist docs/maintainability/file-size-allowlist.json --enforce --max-lines 500 --git-diff-base origin/master --print-limit 200
```

Expected changed files:

- `docs/plans/A2_HOSTED_ADAPTER_PREFLIGHT_AUDIT.md`
