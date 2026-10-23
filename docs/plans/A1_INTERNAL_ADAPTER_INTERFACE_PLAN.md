# A1 Internal Adapter Interface Plan

Issue: #123

Status: planning artifact only. This document does not approve implementation and does not change the public adapter or plugin surface.

## Goal

Normalize the internal adapter interface used by Zenith's built-in deployment targets before any public delegated adapter API work.

The A1 outcome is a reviewed internal contract proposal. A2 can then move built-in Vercel and Netlify behavior behind that contract, and A3 can separately evaluate any future public adapter RFC.

## Non-goals

- No public adapter plugin API.
- Unsupported/future-scoped: no `zenith adapter add` command in A1.
- Unsupported/future-scoped: no plugin add, remove, create, install, or config mutation command in A1.
- No package-manager detection.
- No `@zenithbuild/plugin-api`.
- No runtime plugin hooks.
- No middleware semantic changes.
- No Vercel or Netlify behavior refactor in A1.
- No new route, security, compiler, bundler, runtime, or dev-server hook surface.

## Files inspected

- `packages/cli/src/adapters/adapter-types.ts`
- `packages/cli/src/adapters/resolve-adapter.ts`
- `packages/cli/src/adapters/adapter-static.js`
- `packages/cli/src/adapters/adapter-static-export.js`
- `packages/cli/src/adapters/adapter-node.js`
- `packages/cli/src/adapters/adapter-vercel.ts`
- `packages/cli/src/adapters/adapter-netlify.ts`
- `packages/cli/src/adapters/adapter-vercel-static.ts`
- `packages/cli/src/adapters/adapter-netlify-static.ts`
- `packages/cli/src/adapters/route-rules.js`
- `packages/cli/src/adapters/validate-hosted-resource-routes.js`
- `packages/cli/src/build.js`
- `packages/cli/src/dev-server.js`
- `packages/cli/src/preview/create-preview-server.js`
- `packages/cli/src/config.js`
- `docs/rfcs/adapter-plugin-surface.md`
- `docs/documentation/contracts/extension-contract.md`

## Current adapter surface

The current internal adapter contract is `AdapterDriver`:

```ts
interface AdapterDriver {
  name: string;
  validateRoutes: (manifest: AdapterRouteManifest) => void;
  adapt: (options: AdaptOptions) => Promise<void>;
}
```

`resolveBuildAdapter(config)` normalizes three paths:

- `target`: built-in target name resolves to a built-in adapter.
- `adapter`: advanced raw object with `name`, `validateRoutes`, and `adapt`.
- `legacy`: internal build callers without loaded config adapt through static output behavior.

`build()` currently owns canonical framework output generation:

1. load and validate config
2. resolve target and adapter
3. build the route manifest
4. let the adapter validate route compatibility
5. reset `.zenith-output`
6. compile and bundle pages
7. stage images and public assets into static output
8. write server output
9. write build output manifest
10. call `adapter.adapt({ coreOutput, outDir, manifest, config })`

Adapters therefore consume a finalized `.zenith-output` tree and map it into a target-specific output layout.

## Built-in adapter responsibilities

| Target | Route validation | Output layout | Runtime packaging | Target metadata |
| --- | --- | --- | --- | --- |
| `static` | rejects server-rendered routes | copies `.zenith-output/static` to `outDir` | none | none |
| `static-export` | rejects server routes, requires concrete dynamic export paths, rejects duplicate concrete paths | writes concrete HTML files and support assets under `outDir` / base path | none | copies `manifest.json` |
| `node` | no target-specific route rejection | writes `static/`, `server/`, `manifest.json`, `index.js`, `package.json` | copies Node runtime helpers, request routing, server error, image service, sharp runtime | `server/config.json` |
| `vercel-static` | rejects server-rendered routes | writes `static/` | none | `config.json` route rules |
| `netlify-static` | rejects server-rendered routes | writes static files at output root | none | `_redirects` |
| `vercel` | validates hosted resource route support | writes `static/`, `functions/`, `config.json` | per-route `.func` bundles, hosted runtime, global middleware runtime, scoped server data when needed, image function | Vercel function config and route config |
| `netlify` | validates hosted resource route support | writes `publish/`, `functions/`, `netlify.toml` | shared hosted runtime, global middleware runtime, scoped server data when needed, per-route functions, image function | `_redirects`, `netlify.toml` |

## Observed gaps before normalization

- Static adapters primarily copy static output, while hosted adapters also rediscover server routes from `.zenith-output/server/manifest.json`.
- `AdaptOptions.manifest` contains the build output manifest, but hosted adapters need richer route metadata from server output.
- Adapter validation uses `AdapterRouteManifest`, while adaptation uses `BuildManifest`; those two shapes are related but not named as separate phases.
- Some adapters are TypeScript and some are authored JavaScript.
- Target capability differences are implicit in adapter code rather than represented as internal metadata.
- Preview and dev target awareness currently comes from `resolveBuildAdapter(config).target`, not from adapter capabilities.

## Proposed internal contract

A2 should introduce a normalized internal adapter model with explicit phases and capability metadata. This should remain internal to the CLI until a separate public RFC is accepted.

Recommended internal shape:

```ts
type InternalAdapterTarget =
  | 'static'
  | 'static-export'
  | 'node'
  | 'vercel'
  | 'netlify'
  | 'vercel-static'
  | 'netlify-static';

interface InternalAdapterCapabilities {
  serverRendering: boolean;
  hostedFunctions: boolean;
  staticExport: boolean;
  routeCheck: boolean;
  imageEndpoint: boolean;
  globalMiddleware: boolean;
  scopedServerData: boolean;
}

interface InternalAdapterContext {
  projectRoot: string;
  coreOutput: string;
  outDir: string;
  config: object;
  adapterName: string;
  target: string;
  builtInTarget?: InternalAdapterTarget;
  buildManifest: BuildManifest;
  routeManifest: AdapterRouteManifest;
  serverManifest: AdapterServerManifest | null;
}

type InternalAdapterValidationContext = Pick<
  InternalAdapterContext,
  'routeManifest' | 'target' | 'adapterName' | 'builtInTarget'
>;

interface InternalAdapterDriver {
  name: string;
  builtInTarget?: InternalAdapterTarget;
  capabilities: InternalAdapterCapabilities;
  validateRoutes(context: InternalAdapterValidationContext): void;
  adapt(context: InternalAdapterContext): Promise<void>;
}
```

The important change is not the exact type spelling. The important contract is:

- framework-owned manifests are explicit inputs
- route validation and output adaptation are separate phases
- target capabilities are first-class internal data
- resolved adapter names remain arbitrary strings so raw adapters such as `cloudflare` stay representable
- built-in target classification stays separate from the resolved target string
- built-in adapters do not rediscover data that the build pipeline can pass directly
- final layout remains adapter-owned
- route semantics remain framework-owned

## Compatibility policy

A1 must not break existing public configuration:

- `target: 'static'`
- `target: 'static-export'`
- `target: 'node'`
- `target: 'vercel'`
- `target: 'netlify'`
- `target: 'vercel-static'`
- `target: 'netlify-static'`
- advanced raw `adapter` objects with `name`, `validateRoutes`, and `adapt`

If A2 adds a richer internal driver, `resolveBuildAdapter()` should adapt current built-in adapters and raw advanced adapters without changing user-facing config semantics.
Raw adapter names must remain valid arbitrary strings.
For example, a custom adapter named `cloudflare` should not require casts or be forced into the built-in `InternalAdapterTarget` union.
A2 should use the optional `builtInTarget` classification only when the adapter is one of Zenith's known built-in targets.

## Boundaries for A2

A2 should be an implementation PR that moves built-ins behind the normalized internal contract while preserving output parity.

A2 should include tests proving:

- every built-in target still resolves
- `target` and `adapter` remain mutually exclusive
- static output layouts are unchanged
- node output layout is unchanged
- Vercel and Netlify hosted output layouts are unchanged
- hosted route order and resource route validation are unchanged
- image endpoint and global middleware packaging remain unchanged
- scoped server data packaging remains unchanged for hosted targets
- preview and dev target-aware behavior remain unchanged

A2 should not introduce public adapter factories or external adapter packages.

## Boundaries for A3

A3 owns the future delegated adapter RFC and any public API decisions.

A3 must decide separately:

- whether raw `adapter` remains an advanced escape hatch or becomes formal public API
- whether public adapter factories are package exports
- whether built-in targets internally map to factories
- what public type names are exported, if any
- whether adapter manifests are frozen, cloned, or passed as read-only references

A3 must not be assumed by A1 or A2.

## Risks

- Treating internal normalization as public API would prematurely lock unstable adapter details.
- Refactoring Vercel and Netlify before the contract is reviewed could cause hosted output drift.
- Passing richer server metadata into adapters without parity tests could hide route or scoped server data regressions.
- Capability metadata could become aspirational unless every field is backed by current behavior and tests.
- Public docs could accidentally advertise delegated adapters before implementation exists.

## Recommended A2 implementation packet

When A2 is approved, start with the smallest behavior-preserving slice:

1. Add internal TypeScript types for normalized adapter context and capabilities.
2. Add a wrapper that converts the current `AdapterDriver` shape into the normalized internal shape.
3. Pass route manifest and server manifest explicitly from `build()` into adapter context.
4. Migrate one low-risk built-in adapter, such as `static`, through the wrapper.
5. Add parity tests for the migrated adapter.
6. Only then migrate hosted adapters, preserving Vercel and Netlify output byte-for-byte where practical.

Stop A2 if any target output changes without explicit approval.

## Validation for this A1 artifact

This document should be validated as docs-only planning work:

```sh
cd /Users/judahsullivan/Personal/framework/docs
bun run docs:gate

cd /Users/judahsullivan/Personal/framework
git diff --check
node ./scripts/file-size-audit.mjs --allowlist docs/maintainability/file-size-allowlist.json --enforce --max-lines 500 --git-diff-base origin/master --print-limit 200
```

Expected changed files for A1:

- `docs/plans/A1_INTERNAL_ADAPTER_INTERFACE_PLAN.md`
