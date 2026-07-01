# Changelog

All notable changes to the Zenith core release train are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this repository tracks the lockstep train in [`TRAIN_VERSION`](./TRAIN_VERSION).

## [Unreleased]

## [0.8.0] - 2026-07-01

### Changed

#### Adapter and plugin boundary groundwork

- Confirmed the internal adapter contract around `AdapterDriver` and `resolveBuildAdapter(...)` without shipping a public adapter plugin API.
- Verified built-in Vercel and Netlify adapters already route through the normalized internal adapter contract and shared hosted infrastructure.
- Added the delegated adapter surface RFC as planning material only, keeping `target` as the stable deployment selector and the raw `adapter` object as an advanced surface.
- Kept extension registry source internal for this train while preserving the read-only plugin and adapter discovery commands in `@zenithbuild/cli`.

#### Middleware and route-check planning

- Closed the post-V1 middleware expansion design lane with explicit decisions: arrays deferred, nested scopes rejected, controlled header staging deferred, and route-check participation deferred.
- Kept global middleware V1 narrow: TypeScript root middleware only, `next` / `redirect` / `deny` only, no arbitrary headers, no nested scopes, no arrays, and no route-check participation.
- Confirmed JavaScript-authored middleware remains unsupported until a separate project language-mode contract is approved.

#### Security, editor tooling, and dependency cleanup

- Removed the legacy V1 compiler `ws` surface and pinned the workspace to a patched `ws` version.
- Closed the v0.8 editor/tooling diagnostics follow-up for the framework language-server path.
- Updated esbuild to address GHSA-gv7w-rqvm-qjhr.
- Removed the benchmark/performance surface that pulled in benchmark-only Astro, Vite, Nuxt, and Next dependencies after high-severity Dependabot alerts; no active `astro` manifest or lockfile references remain.
- Verified the post-removal dependency surface with `bun audit --audit-level high`.
- Added route data contract edge-case coverage and reliability fixes for framework server behavior.

#### Maintainability and release hygiene

- Split oversized CLI drift-gate, dev-server, and server-routing contract test suites into focused owner-area suites.
- Split oversized runtime dom-binding and integration test suites while preserving existing behavior.
- Split active bundler helper clusters and the main output phase into smaller modules under the file-size policy.
- Split docs/site generation helpers, overlay sheet documentation, AI endpoint generation, and site workspace public-asset helpers into narrower files.
- Calibrated generated/legacy file-size audit policy and documented Graphify/Kimi scoped evaluation as optional maintainer context, not required workflow.
- Added internal audits for Rolldown bundler integration and contract truth alignment for runtime, hydration, and bundler payload ownership.

#### What this release does not change

- No public adapter plugin API ships in this release.
- No middleware arrays, nested middleware scopes, controlled response headers, `middleware.js`, or route-check middleware participation ship in this release.
- No Graphify workflow is required for issue closeout or framework development.
- No native binary distribution migration is introduced.

## [0.7.12] - 2026-06-02

### Changed

#### Component Server Values v1

- Added Component Server Values for layout/component-owned server values, implemented internally as Scoped Server Data.
- Added the Component Server Values architecture lock, owner scanner, scoped diagnostics, and manifest/classification metadata that feed the Scoped Server Data pipeline.
- Added request-time scoped execution across Node, dev, preview, Vercel, and Netlify server paths.
- Added scoped server-output packaging, owner-local SSR template binding, runtime hydration from serialized scoped payloads, repeated component instance keys, static literal prop support, and generated scoped server data declarations.
- Added CSV diagnostics and final regression fixtures covering invalid owner APIs, prerender conflicts, dynamic scoped props, server-source leakage, serialization, SSR, hydration, hosted parity, and type declarations.

#### Server data, adapter, and middleware groundwork

- Stabilized the server-data pipeline around route-owned `guard(ctx)`, `action(ctx)`, and `load(ctx)` while keeping Component Server Values owner-local.
- Added TypeScript migration groundwork for hosted adapter infrastructure and adapter entrypoints without shipping a public adapter plugin API.
- Added internal adapter driver types and an adapter plugin surface RFC as planning material only; this release does not ship a public adapter plugin API.
- Added global middleware groundwork across runtime paths while preserving the current TypeScript-only root middleware contract and without shipping middleware arrays, nested scopes, controlled headers, or route-check participation.

#### Config and release integrity

- Added a conservative config-time V1 plugin surface for named plugin objects with an optional `config()` hook that may patch safe config keys only.
- Kept plugin scope narrow: no transform, middleware, route/security policy, compiler, bundler, dev-server, or public adapter hooks are shipped.
- Aligned the framework release publish surface and platform binary smoke/recovery checks so the lockstep train excludes standalone editor packages and verifies native binary packages more reliably.

#### Docs and project hygiene

- Added Component Server Values documentation and migration guidance, including the v1 non-goals: no React Server Components, no client scoped refetch, no build-time scoped prerender, and no component/layout route-control APIs.
- Added current server-data pipeline audit and architecture-lock documentation for the completed Component Server Values v1 work.
- Regenerated public AI docs artifacts for the updated server data, routing, hydration, props, diagnostics, and Component Server Values documentation.
- Ignored generated Zenith output in create-zenith starter projects.

## [0.7.11] - 2026-05-17

### Changed

#### Compiler hardening and diagnostics

- Tightened `.zen` event handler validation so direct-call handler forms are rejected consistently while preserving identifier/member references and inline function handlers.
- Added stable compiler diagnostics for invalid scripts, invalid markup expressions, and clearly unbound markup identifiers: `ZEN-SCRIPT-SYNTAX`, `ZEN-EXPR-SYNTAX`, and `ZEN-EXPR-UNBOUND`.
- Converted malformed markup parser failures into structured `ZEN-MARKUP-PARSE` diagnostics, including mismatched tags and unexpected EOF, without panic-style bridge output.

#### Image optimizer hardening

- Hardened remote image optimization so allowed remote image URLs are resolved and validated before fetch, with the validated target pinned across the initial request and each redirect hop while preserving expected host semantics.

#### Runtime cleanup and embedded markup hardening

- Ensured structural fragment replacement drains nested cleanup before text or HTML replacement.
- Made cleanup continue after throwing disposers and report collected cleanup errors deterministically.
- Rolled back `zeneffect` subscriptions and cleanup registrations when setup or registration fails.
- Hardened embedded-markup URL-bearing attributes, including `srcset`, by decoding and normalizing values before protocol validation.

#### Build, routing, and server output

- Shared route classification across build and manifest paths so protected routes cannot be marked prerender.
- Fixed dev output to honor configured `basePath`, including soft navigation under the configured prefix.
- Tightened dev rebuild cache invalidation for route deletions and static-to-interactive transitions.
- Made server route output names collision-resistant.

#### Dev server stability

- Improved dev rebuild and browser refresh recovery so failed builds surface clear build-error responses without wedging the dev server.
- Preserved resource route execution while page refreshes are served build-error responses.
- Added automatic next-available-port fallback with clear CLI output for requested and occupied ports, without killing processes.

#### Server and resource hardening

- Validated SSE `event`, `id`, and `retry` metadata while preserving safe headers, `retry: 0`, and multiline `data` framing.
- Added packaged Node support for `ZENITH_PUBLIC_ORIGIN` / `publicOrigin` so secure cookies are set correctly behind HTTPS termination while local HTTP behavior remains unchanged.

#### Package, release, and CI integrity

- Made Windows CLI bin entrypoint detection platform-safe and locked package `.bin` ownership.
- Made native binary publish smoke checks fail closed and kept Windows `.exe` handling covered.
- Derived CI integration shard coverage from the filesystem and included the router legacy Jest suite in the core release gate.
- Audited CI/release/publish trust boundaries, hardened workflow permissions, scoped OIDC to npm publish jobs, and added static workflow policy coverage.
- Cleaned dependency audit findings through dev/test/browser automation updates without adding an allowlist or changing production-shipped runtime dependencies.

#### Dev/CI maintenance

- Kept Batch 1 regression coverage inside focused test files and fixed the PR touched-file audit path so CI can evaluate changed files from pull request checkouts.

#### Docs and API contract clarity

- Extended docs gates to catch forbidden component callsite DOM event prop drift while preserving ordinary callback props.
- Clarified router route-policy APIs as advisory UX only and kept server `guard(ctx)` / `load(ctx)` as the security boundary.
- Aligned router event type declarations with emitted route events and centralized generated `Zenith.LoadContext` declarations around the real server route contract.
- Documented that signed session cookies provide integrity and tamper resistance, not confidentiality.
- Aligned public config truth for `static-export`, target parity, unknown-key rejection, env-driven `ZENITH_DEV_TRACE`, and dev config-change restart warnings.
- Updated hosted image endpoint wording to reflect current `node`, `vercel`, `netlify`, and `static-export` behavior.

#### Route-local middleware and plugin surface

- Added end-to-end parity coverage for route-local `withMiddleware(...)` across page and resource routes, dev, packaged Node, and hosted function paths without introducing a global middleware primitive.
- Quarantined archived legacy plugin code from the current public API surface and clarified that the public plugin API is currently closed.

#### Language server and editor DX

- Made the framework language-server package expose a reliable `zenith-language-server` stdio entrypoint while preserving explicit transport arguments.
- Added protocol-level LSP smoke coverage for initialization, diagnostics, hover, and completion, plus honest Neovim smoke coverage and docs for current limitations.
- Note: standalone `zenith-language` and `zenith-language-server` repositories have separate `v0.7.12` tags, but their npm publish remains separate from this framework release and was blocked locally by npm auth.

#### Maintainability planning

- Added the ZFW-26 oversized-file refactor plan and focused follow-up issues for active bundler source, runtime tests, CLI tests, generated/golden policy, docs/site scripts, the overlay sheet docs page, and archived legacy bundler audit handling.

## [0.7.10] - 2026-04-25

### Changed

#### Router package surface

- Fixed the published `@zenithbuild/router` package surface so `template-refresh.js` ships with the router template entrypoint that imports it.
- Added a router package contract assertion that fails if the refresh helper exists in source but is omitted from the package `files` allowlist again.

#### Vercel/build compatibility

- Restored fresh installs of the lockstep Zenith package set for consumers building with hosted package installs, including Vercel builds that resolve `@zenithbuild/*` from npm instead of a local workspace checkout.
- This closes the `Cannot find module ... @zenithbuild/router/template-refresh.js` failure seen when a site installed the published `0.7.9` package set.

#### What this release does not change

- No router runtime behavior changed.
- No new public API or route syntax was added.
- No site-side workaround or `node_modules` patch is required; this is a framework package-surface fix published through the monorepo train.

## [0.7.9] - 2026-04-23

### Changed

#### Compiler hardening follow-up

- Finalized the new foreign-syntax compiler gate so it still rejects foreign DOM event spellings on native markup while preserving existing Zenith component handler props such as `onClick`, `onPress`, `onInput`, and `onSubmit` when they are passed through component boundaries.
- This patch closes the false positive exposed by the initial `0.7.8` release candidate, where component-level function props were being misclassified as forbidden DOM event syntax.

#### Diagnostics and contract stability

- Added regression coverage proving event-like component props remain valid input alongside the new foreign-syntax diagnostics contract.
- The compiler continues to reject native foreign event syntax such as `@click`, `onClick`, and `onclick` on real DOM elements with the same actionable Zenith rewrite hints.

#### What this release does not change

- No new syntax was added.
- No runtime behavior changed.
- No UI-layer workaround was introduced.
- This is a compiler follow-up patch that narrows the invariant to the correct DOM-vs-component boundary.

## [0.7.8] - 2026-04-23

### Changed

#### Compiler hardening

- Guard surfaced copied foreign template/control syntax leaking into real `.zen` source. Zenith now rejects foreign control/template forms such as `@if`, `@else`, `@elseif`, `{#if}`, `{/if}`, `{#each}`, `{/each}`, `v-if`, `v-else`, and `v-for` before parser/emission can carry them into compiled output.
- The new invariant runs as a compiler-owned pre-parse gate, so this class of foreign syntax now fails at compile time instead of reaching rendered UI as literal text.

#### Event syntax enforcement

- Zenith now rejects foreign event spellings inside `.zen`, including directive forms like `@click`, `@input`, `@change` and DOM prop forms like `onClick`, `onInput`, `onclick`, and other known camelCase/lowercase DOM event props.
- Foreign event diagnostics now point authors back to the canonical Zenith event contract: `on:<event>={handler}`.

#### Diagnostics and author guidance

- Structured compiler diagnostics now emit stable foreign-syntax error codes, messages, ranges, docs paths, and correction hints for both control-syntax and event-syntax violations.
- Golden compiler tests lock the diagnostic wording and hint shape so future compiler changes cannot silently regress this contract.
- Canonical docs now show the invalid foreign tokens (`@if`, `@click`, `onClick`) alongside the correct Zenith forms, and the generated AI docs index was refreshed so the public docs surface stays aligned with the compiler contract.

#### What this release does not change

- No new template or event syntax was added.
- No runtime behavior changed.
- No UI-layer workaround was introduced.
- This release is compiler enforcement, diagnostics, tests, and docs hardening only.

## [0.7.7] - 2026-04-04

### Changed

- Fixed release pipeline Playwright browser provisioning by aligning workflow installs to the `apps/smoke-test` workspace Playwright version, removing the revision mismatch that caused `Publish (npm)` and CI smoke failures on tagged releases.

## [0.7.6] - 2026-04-03

### Changed

- Added resource-route streaming (`stream(...)`) and SSE (`sse(...)`) helpers as resource-only standalone contract results, with local/hosted parity and Node runtime streaming behavior aligned to the same server contract.
- Added `src/api/**` resource-route DX aliasing and explicit route-level middleware composition (`withMiddleware(...)`) while preserving the single non-HTML server model and existing server/runtime contracts.
- Hardened publication benchmark truth gates so empty/timeouts/runtime-error categories fail explicitly, and locked publication policy to keep Zenith determinism as a hard gate with external-framework determinism reported as caveat metadata.
- Reduced emitted interactive payload materially across the optimization lane, including production-only runtime/router/page compaction and deterministic production runtime/router/page minification, while keeping determinism, zero-JS static omission, and hosted parity green.
- Completed structural decomposition on bundler/compiler/CLI hot paths (`main.rs`, compiler/parser/script, dev-server/preview/server-contract/dev-build-session) and added file-size audit governance with scoped CI enforcement.

## [0.7.5] - 2026-03-30

### Changed

- Added the rewrite-free `static-export` deployment target with explicit `exportPaths`, base-path-aware public output, and target-aware preview behavior on the existing manifest/server contract.
- Added `zenPresence(...)`, the optional `presence(...)` alias, `zenNavigationShell(...)`, and the canonical always-mounted overlay/sheet pattern so Zenith now ships one documented UI composition path on top of the existing lifecycle.
- Added route-owned multipart uploads, truthful cookie sessions on `ctx.auth`, explicit resource routes with `json(...)`, `text(...)`, and `download(...)`, and the router-side `refreshCurrentRoute()` bridge for re-running the current page route after non-HTML writes.
- Moved final build/static HTML image materialization into bundler-owned truth while keeping runtime/server image materialization explicit, and tightened tests/docs around that build/runtime split.
- Restored and expanded hosted parity on `vercel` and `netlify` for packaged page-route execution, page-route cookie sessions, hosted resource `json(...)` / `text(...)` routes with redirect/deny/auth/cookie behavior, and the `/_zenith/image` runtime endpoint.

## [0.7.4] - 2026-03-28

### Changed

- Bumped the lockstep framework train to `0.7.4` so published `@zenithbuild/compiler` and optional `@zenithbuild/compiler-*` platform packages ship a `zenith-compiler` binary that includes `--merge-image-materialization` (Track B static image props artifact), matching CI verification of staged platform binaries.
- Aligned language tooling packages (`@zenithbuild/language-server`, `@zenithbuild/language`) and workspace consumers on the same compiler train version.

## [0.7.2] - 2026-03-24

### Changed

- Landed the deployment target system as a real framework contract across `static`, `vercel-static`, `netlify-static`, `vercel`, `netlify`, and `node`, with canonical `.zenith-output/manifest.json` and `.zenith-output/server/` layers consumed by adapters instead of host-specific route inference.
- Hardened the server packaging and runtime contract around packaged `guard` / `load` execution, deterministic SSR payload injection, explicit redirect / deny / error response behavior, and target-aware `zenith preview` semantics.
- Added deployment smoke coverage to CI, aligned starter templates and deployment docs to the truthful target model, and froze manifest/server contract coverage with dedicated fixture snapshots and platform smoke tests.
- Added deployment-wide `basePath` support so public app URLs, bundled assets, router navigation, SSR URL reconstruction, `/_zenith/image`, `/__zenith/route-check`, preview, adapters, and the Node runtime now behave consistently under non-root deploy paths.
- Moved the lockstep framework packages and their internal references from `0.7.1` to `0.7.2`.

## [0.7.1] - 2026-03-22

### Changed

- Finalized the OIDC-only trusted publishing contract so prerelease tags publish from `train`, stable tags publish from `master`, and the legacy latest-promotion flow is removed from the framework release path.
- Aligned publish workflow naming, script paths, and internal release-policy docs around one direct-publish `beta` / `train` / `latest` model.

## [0.7.0] - 2026-03-21

### Changed

- Rebuilt the public site surfaces around Directus-backed content, editorial landing/detail layouts, and the new documentation navigation and reading experience.
- Added the native `Image` v1 surface plus build/dev/preview image handling, and hardened the compiler/dev build pipeline around typed embedded markup, hoisted expression rewriting, and narrower rebuild behavior.
- Added benchmark harness, rebuild measurement caveats, and performance documentation for the current cross-framework results.
- Added the Directus editorial workspace, extension build tooling, and repo-sync content flows for CMS deployment testing.

## [0.6.18] - 2026-03-13

### Changed

- Fixed slot-scoped owner attribution so slotted refs, state, and signals keep parent scope through component occurrence collection and emitted child props.
- Separated compiler ref markers from dynamic attr markers (`data-zx-ref` vs `data-zx-*`) to prevent same-node marker collisions during hydration.
- Fixed runtime SVG `class` bindings to apply through SVG-safe attribute writes while preserving existing HTML `class` behavior.
- Fixed CLI post-compiler expression rewriting so mixed reactive/local-const component expressions stay fully rewritten in final built binding functions.
- Hardened server routing, client fetch-before-commit navigation, lifecycle hooks, and the narrow transition prototype around one documented routing contract.
- Added structured compiler diagnostics to the language-tooling bridge, shipped the first compiler-code-backed `ZEN-DOM-*` quick fixes, and aligned hover/completion coverage to the documented Zenith surface.
- Hardened the site wrapper/dev path around toolchain selection, public-asset sync, and rebuild handoff behavior so the real site path stays on the verified framework contracts.

## [0.6.17] - 2026-03-06

### Changed

- Fixed train publish metadata checks to ignore `NPM_CONFIG_TAG=train` during npm registry lookups, preventing false platform bootstrap failures for existing package names.

## [0.6.16] - 2026-03-06

### Changed

- Editor tooling: zenith-language + language-server now ship with canonical TS tokenization, compiler diagnostics, hovers, and completions.
- Documented the `beta` / `train` / `master` release model, added tag-to-branch publish guards, and moved framework publishes to the tag-driven `CI -> npm publish -> GitHub Release` workflow with OIDC-only normal publishing.
- Imported `@zenithbuild/language` and `@zenithbuild/language-server` into the monorepo, aligned `.zen` editor tooling to the canonical Zenith grammar/LSP surface, and added CI coverage for grammar embedding, hover docs, completions, and ZEN-DOM diagnostics.

## [0.6.13] - 2026-03-05

### Changed

- Fixed vendor bundling classification so `@/` path-alias imports are treated as project modules instead of external npm packages, preventing initial build failures caused by `.zen` modules being pulled into vendor entrypoints.
- Added bundler regression coverage to lock the `@/` alias behavior in vendor external detection.
- Added missing runtime dependencies (`gsap`, `tailwind-merge`) to the site package so fresh installs do not fail on unresolved UI imports.

## [0.6.12] - 2026-03-04

### Changed

- Fixed function-prop transport for component callsites so parent-scope symbols are emitted through scoped/renamed bindings (no raw unscoped identifiers in emitted props objects).
- Added regression coverage for direct and multi-hop event-like handler props (`onClick`, `onKeydown`, `onInput`, `onSubmit`) plus non-function prop scoping transport.
- Fixed component tag parsing for inline prop function expressions (for example `onSubmit={(event) => submit(event)}`) so component expansion and prop lowering remain stable.
- Documented canonical handler-prop forwarding (`on:*` wiring in component markup) and tightened docs syntax gates to distinguish DOM `onClick=` misuse from valid component prop examples.

## [0.6.11] - 2026-03-04

### Changed

- Fixed the `@zenithbuild/bundler` publish contract so the npm tarball ships `scripts/render-assets.mjs`, and the native bundler now resolves that bridge from installed `node_modules` layouts instead of only repo checkouts.
- Added a bundler `npm pack --dry-run` regression gate so CI fails if runtime bridge scripts or `dist/**` drop out of the published tarball again.
- Documented the release-channel publishing contract for prerelease and stable tags so `train` and `latest` stay aligned through distinct tagged publishes.

## [0.6.10] - 2026-03-04

### Changed

- Fixed cross-OS fresh installs by moving `@zenithbuild/compiler` to platform-specific native packages, matching the bundler distribution model and keeping the meta package binary-free.
- Updated CLI toolchain resolution to prefer installed compiler and bundler platform packages, while treating wrong-OS native binaries as fallthrough candidates instead of hard failures.
- Fixed `zenith-bundler --version` to report the lockstep npm train version when builds inject `ZENITH_TRAIN_VERSION`, with the Cargo crate version kept as the deterministic fallback.
- Expanded the cross-OS smoke and toolchain resolution tests so wrong-format native binaries and workspace fallback leaks fail CI before release.

## [0.6.9] - 2026-03-03

### Changed

- Fixed the `@zenithbuild/bundler` meta package dependency surface so fresh installs can resolve runtime and router assets correctly while still using platform-specific native bundler packages.

## [0.6.8] - 2026-03-03

### Changed

- Fixed cross-OS `@zenithbuild/bundler` installs by moving native bundler delivery to platform-specific packages, with the `@zenithbuild/bundler` meta package resolving the correct installed binary for the active OS and CPU.

## [0.6.7] - 2026-03-03

### Changed

- TypeScript strictness ramp (Level 1) for `@zenithbuild/router` and `@zenithbuild/core`, plus a partial Level 1 ramp for TS leaf modules in `@zenithbuild/runtime` and `@zenithbuild/cli`, with no public API changes.

## [0.6.6] - 2026-03-02

### Added

- A single monorepo CI gate via `bun run ci`, including the Playwright smoke gate for `apps/smoke-test`.
- CLI version mismatch detection that warns when installed `@zenithbuild/*` packages or the bundler binary drift from the active train and prints a fix command.

### Changed

- Internal Tailwind v4 compilation is covered in dev/build by the bundler contract tests, including hard failures for unresolved raw `tailwindcss` imports in emitted CSS.
- The dev-server HMR v1 contract was hardened around the CSS endpoint and update sequencing.
- The compiler JSON envelope remains additive with `schemaVersion: 1`, stable `warnings`, and always-present `ref_bindings` for downstream consumers.
- The imported Zenith docs tree now lives at root `/docs` as the documentation source of truth with no content dropped during the move.

## [0.6.5] - 2026-03-01

### Added

- A single monorepo CI gate via `bun run ci`, including the Playwright smoke gate for `apps/smoke-test`.
- CLI version mismatch detection that warns when installed `@zenithbuild/*` packages or the bundler binary drift from the active train and prints a fix command.

### Changed

- Internal Tailwind v4 compilation is covered by the bundler contract tests, including hard failures for unresolved raw `tailwindcss` imports in emitted CSS.
- The dev-server HMR v1 contract was hardened around the CSS endpoint and update sequencing.
- The compiler JSON envelope remains additive with `schemaVersion: 1`, stable `warnings`, and always-present `ref_bindings` for downstream consumers.
- The imported Zenith docs tree now lives at root `/docs` as the documentation source of truth with no content dropped during the move.
