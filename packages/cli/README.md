# @zenithbuild/cli ⚡

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.


The command-line interface for developing and building Zenith applications.

## Canonical Docs

- CLI contract: `../zenith-docs/documentation/cli-contract.md`
- Deployment targets guide: `/Users/judahsullivan/Personal/zenithbuild-monorepo/docs/documentation/guides/deployment-targets.md`
- Script server/data contract: `../zenith-docs/documentation/contracts/server-data.md`
- Server output contract: `./SERVER_OUTPUT_CONTRACT.md`

## Overview

`@zenithbuild/cli` provides the toolchain needed to manage Zenith projects. While `create-zenith` is for scaffolding, this CLI is for the daily development loop: serving apps, building for production, and managing plugins.

## Features

- **Dev Server**: Instant HMR (Hot Module Replacement) powered by Bun.
- **Build System**: optimized production bundling.
- **Plugin Management**: Easily add and remove Zenith plugins.
- **Preview**: Test your production builds locally.

## Config Baseline

Current top-level `zenith.config.js` keys:

- `router`
- `embeddedMarkupExpressions`
- `typescriptDefault`
- `outDir`
- `pagesDir`
- `basePath`
- `target`
- `adapter`
- `strictDomLints`
- `images`

There is no separate `assetPrefix` config. Public framework asset URLs follow `basePath`.

`pagesDir` resolution:

- If `pagesDir` is set, the CLI uses that path relative to the project root.
- If `pagesDir` is not set, the CLI checks `pages/` first, then `src/pages/`, then falls back to the default `pages` path.

`basePath` behavior:

- `basePath` defaults to `/`.
- Canonical route paths stay base-path free in manifests and route classification.
- Public app URLs, bundled asset URLs, router URLs, `/_zenith/image`, and `/__zenith/route-check` are prefixed with `basePath`.
- Static emitted files stay adapter-neutral; adapters map the public base path to those canonical outputs.

`router` behavior:

- `router: true` enables client router bootstrap/runtime injection.
- `router: false` disables client router bootstrap/runtime injection.
- `assets/router-manifest.json` may still be emitted as an internal preview artifact. Its presence does not mean client router mode is enabled.

`target` / `adapter` behavior:

- `target` is the shorthand deployment target. Phase 1 defaults loaded config to `target: 'static'`.
- `adapter` is the explicit adapter object form and is mutually exclusive with `target`.
- `vercel-static` emits a Vercel Build Output API layout rooted at `outDir`.
- `netlify-static` emits a Netlify publish directory rooted at `outDir`, including generated `_redirects` rewrites for dynamic prerendered routes.
- `vercel` emits a Vercel Build Output API layout with packaged route functions for server-classified routes and static rewrites for prerendered dynamic routes.
- `netlify` emits a deploy root with `publish/`, `functions/`, `netlify.toml`, and generated `_redirects` that force server-classified routes through packaged functions.
- `node` emits a standalone Node artifact rooted at `outDir` with `index.js`, `package.json`, `manifest.json`, `static/`, and `server/`.

Server-capable target contract:

- Route classification stays upstream in the manifest and server package layers.
- `.zenith-output/server` is the canonical packaged server contract consumed by adapters.
- Adapters package classified output into host layouts; they do not reinterpret route meaning.

Current limitations:

- There is no separate `assetPrefix` knob. Assets intentionally follow `basePath`.
- `vercel` and `netlify` do not yet emit a deployed `/_zenith/image` endpoint. The `node` target does.

## Commands

### `zenith dev`
Starts the development server on `localhost:3000`.

### `zenith build`
Compiles and bundles your application for production.

### `zenith preview`
Previews the locally built target contract for verification. Static targets serve built files; `target: 'node'` boots the built Node artifact.

### `zenith add <plugin>`
Installs and configures a Zenith plugin.

## Installation

Typically installed as a dev dependency in your Zenith project:

```bash
bun add -d @zenithbuild/cli
```

## License

MIT
