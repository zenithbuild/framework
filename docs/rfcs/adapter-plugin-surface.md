# RFC: Delegated Adapter Surface for `zenith.config.js`

## 1. Status: RFC Only, Not Implementation Approval

Status: Draft planning artifact for issue #125.

This RFC does not approve implementation. It does not change the runtime, config schema, plugin hooks, compiler, bundler, route classification, middleware behavior, output layout, or documentation truth contract.

Any implementation must be separately approved after this RFC is reviewed. Until then, the only shipped public behavior remains the current `target` selector and the advanced raw `adapter` object.

## 2. Problem Statement

Zenith already supports multiple deployment targets, including `vercel`, `netlify`, `vercel-static`, `netlify-static`, `node`, `static`, and `static-export`. These targets package the same canonical framework output into different host layouts.

The current model is effective for built-in targets, but it does not provide a reviewed, stable way for external platform integrations to own deployment packaging. The future surface needs to let platform packages adapt finalized Zenith output without becoming a general plugin system.

The problem to solve is narrow:

- allow host-specific deployment packaging outside the core CLI when appropriate
- keep `target` as the simple built-in path
- preserve deterministic framework output before adaptation
- avoid route, security, middleware, compiler, bundler, and runtime mutation hooks

## 3. Current State

### `target`

`target` is the stable public deployment selector for common built-in output modes:

```js
export default {
  target: 'vercel'
};
```

Current supported target names are `static`, `static-export`, `node`, `vercel`, `netlify`, `vercel-static`, and `netlify-static`.

### Advanced `adapter`

`adapter` already exists as an advanced deployment configuration surface. It is mutually exclusive with `target` and must provide an object with:

- `name`
- `validateRoutes(manifest)`
- `adapt(options)`

This raw object shape is currently an advanced hook, not a fully documented adapter package API.

### Internal `AdapterDriver`

The internal adapter contract is modeled by `AdapterDriver`. `resolveBuildAdapter(...)` normalizes either `target` or `adapter` into a resolved build adapter:

```ts
interface AdapterDriver {
  name: string;
  validateRoutes: (manifest: AdapterRouteManifest) => void;
  adapt: (options: AdaptOptions) => Promise<void>;
}
```

The build pipeline calls `validateRoutes(...)` after manifest generation and calls `adapt(...)` after canonical `.zenith-output/` has been written.

### Current Config Plugin Limits

Config plugins are config-time only. They may provide a conservative `config()` hook, but they cannot patch `target`, `adapter`, `pagesDir`, or `plugins`.

They also cannot register middleware, mutate routes/security policy, transform files, or install compiler, bundler, dev-server, runtime, or router hooks.

## 4. Proposed Public Surface

The recommended future public shape is an adapter factory assigned to `adapter`:

```js
import { vercel } from '@zenithbuild/adapter-vercel';

export default {
  adapter: vercel()
};
```

The user-facing mental model should be "delegated adapter" or "adapter factory", not a general plugin. The adapter factory returns an adapter object that implements the public adapter contract.

This shape is intentionally not:

```js
export default {
  plugins: [vercel()]
};
```

`plugins: [vercel()]` is not recommended because it conflates deployment output ownership with config plugins and invites expectations of lifecycle hooks, middleware hooks, compiler hooks, and route mutation hooks.

## 5. Relationship to `target`

`target` remains supported as the stable simple path:

```js
export default {
  target: 'vercel'
};
```

A3 must not deprecate `target`. Built-in targets remain the recommended path for users who do not need explicit adapter package configuration.

The future relationship should be:

- `target: 'vercel'`: simple built-in shorthand
- `adapter: vercel()`: explicit delegated adapter factory
- `target` and `adapter`: still mutually exclusive

After implementation and parity validation, built-in target aliases may internally map to the same adapter factories. That internal mapping must not change output behavior.

## 6. Adapter Ownership Boundary

Delegated adapters may own:

- finalized `.zenith-output/` consumption
- final `outDir` output layout
- runtime asset copying
- host function generation
- static/publish placement
- platform config emission
- validation of already-classified route manifests

Delegated adapters must consume framework outputs. They must not mutate framework route semantics.

## 7. Security Model

Adapter factories and adapter objects are trusted executable Node configuration code. Zenith must not promise sandboxing.

The framework should still constrain and test the public contract:

- adapter config must be explicitly provided by trusted project configuration
- adapter output must stay within declared output boundaries
- route manifests passed to adapters should be treated as framework-owned data
- route authorization semantics remain owned by route `guard(ctx)` and `load(ctx)`
- root global middleware remains TypeScript-only and file-based
- adapter packages cannot register middleware

Delegated adapters must not own:

- route authorization semantics
- middleware semantics
- middleware registration
- auth signing/session internals
- compiler behavior
- bundler behavior
- scanner/classification/manifest ownership
- route result validation
- server contract validation
- arbitrary route mutation
- route-check behavior
- source transforms

## 8. Built-In Vercel/Netlify Migration Path

The migration path should be phased:

1. Approve this RFC only.
2. Add public adapter type exports and contract tests only.
3. Introduce built-in adapter factories such as `vercel()` and `netlify()`.
4. Keep built-in target aliases such as `target: 'vercel'` and `target: 'netlify'`.
5. Internally map built-in targets to factories only after parity tests prove no behavior drift.
6. Update user-facing docs through issue #114 only after implementation lands.

No migration step should change Vercel or Netlify output layout, route order, generated function behavior, hosted middleware behavior, image endpoint behavior, or static output placement.

## 9. Compatibility With Current Custom Adapter Object

Existing advanced raw adapter objects must continue to work during migration:

```js
export default {
  adapter: {
    name: 'custom',
    validateRoutes(manifest) {},
    async adapt(options) {}
  }
};
```

The RFC leaves one compatibility decision open: whether the raw object becomes a formal public API or remains an advanced unstable escape hatch while adapter factories become the recommended public shape.

A3 implementation must not break existing `target` usage or existing raw adapter configuration.

## 10. Test Matrix

Future implementation must include tests for:

- `target` still works for every built-in target
- `adapter: vercel()` works after the delegated adapter implementation lands
- `adapter: netlify()` works after the delegated adapter implementation lands
- `target` plus `adapter` remains rejected
- config plugins still cannot patch `target` or `adapter`
- unsupported plugin hooks such as middleware, compiler, bundler, transform, resolve, server, and runtime hooks remain rejected
- Vercel static output path and config parity
- Netlify static output path and `_redirects` parity
- Vercel hosted function path, route order, config, image endpoint, and runtime copy parity
- Netlify hosted publish/functions layout, redirects, image endpoint, and runtime copy parity
- hosted middleware parity remains unchanged for built-in server targets
- public contract truth tests do not advertise unsupported adapter APIs before implementation
- issue #114 docs follow-up happens only after implementation lands

## 11. Rollout Gates

Recommended gates:

1. RFC approval.
2. Public type export and contract test approval.
3. Adapter factory implementation approval for built-ins.
4. Built-in target alias parity approval.
5. External package publishing approval.
6. User-facing documentation update through #114.

Each gate should ship independently when possible and should preserve current runtime behavior.

## 12. Non-Goals

This RFC does not propose:

- implementation in this issue
- config schema changes without a later implementation gate
- plugin hooks
- middleware registration
- route/security mutation hooks
- compiler hooks
- bundler hooks
- runtime hooks
- route-check behavior changes
- JavaScript root middleware support
- `middleware.js`
- CSV v1 / PR #118 overlap
- source transforms
- adapter capabilities or runtime metadata beyond type-only contract work explicitly approved later

## 13. Open Questions

- Package names: should delegated adapters live in packages such as `@zenithbuild/adapter-vercel`, or should factories be exported from an existing Zenith package first?
- Should `validateRoutes(...)` remain synchronous, or should the public contract allow async validation?
- Should route manifests and build manifests be frozen, cloned, or passed as read-only references before public adapter calls?
- Should static variants use separate factories such as `vercelStatic()`, or options such as `vercel({ output: 'static' })`?
- Should the raw adapter object be documented as an advanced unstable escape hatch or promoted to a formal public API?
- Should adapter factories accept platform options immediately, or should the first release expose zero-option factories only?

## 14. Documentation Dependency on #114

Issue #114 remains the user-facing documentation follow-up. Adapter factory documentation must not be published as available until the implementation lands and is tested.

Before #114 updates user docs, public contract truth tests must prevent premature claims that Zenith supports:

- public adapter plugin lifecycle hooks
- plugin middleware registration
- compiler or bundler plugin hooks
- route/security mutation hooks
- JavaScript root middleware
- `middleware.js`

Until implementation lands, docs should continue to describe the current truth: `target` is the stable public deployment selector, and raw `adapter` is an advanced deployment configuration surface.
