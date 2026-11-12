# @zenithbuild/cli ⚡

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.

The command-line interface for developing and building Zenith applications.

## Canonical Docs

- CLI contract: `../../docs/documentation/cli-contract.md`
- Deployment targets guide: `../../docs/documentation/guides/deployment-targets.md`
- Route protection: `../../docs/documentation/routing/route-protection.md`
- Server output contract: `./SERVER_OUTPUT_CONTRACT.md`

## Overview

`@zenithbuild/cli` is Zenith's deterministic project orchestrator. It owns the daily development loop:

- `zenith dev`
- `zenith build`
- `zenith preview`

It ships a minimal V1 plugin surface for config-time normalization only.

## Features

- **Dev Server**: Instant HMR (Hot Module Replacement) powered by Bun.
- **Build System**: deterministic build output and adapter packaging.
- **Preview**: target-aware verification of built output.

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
- `plugins`

There is no separate `assetPrefix` config. Public framework asset URLs follow `basePath`.

`plugins` behavior:

- Plugins are added in `zenith.config.js` with `plugins: [authPlugin(), mdxPlugin()]`.
- V1 plugins must be named objects and may only provide a `config()` hook.
- V1 plugin config patches are shallow top-level patches; nested objects such as `images` replace that config object instead of deep-merging.
- V1 plugins cannot transform files, register middleware, mutate routes/security, or install compiler/bundler/dev-server hooks.
- Global middleware is separate Lane 2 work.

`pagesDir` resolution:

- If `pagesDir` is set, the CLI uses that path relative to the project root.
- If `pagesDir` is not set, the CLI checks `pages/` first, then `src/pages/`, then falls back to the default `pages` path.

`basePath` behavior:

- `basePath` defaults to `/`.
- Canonical route paths stay base-path free in manifests and route classification.
- Public app URLs, bundled asset URLs, router URLs, and any framework endpoints exposed by the selected target are prefixed with `basePath`.
- Canonical `.zenith-output` files stay adapter-neutral; final adapter output may still nest public files under `basePath` when direct-file serving requires it.

`router` behavior:

- `router: true` enables client router bootstrap/runtime injection.
- `router: false` disables client router bootstrap/runtime injection.
- `assets/router-manifest.json` may still be emitted as an internal preview artifact. Its presence does not mean client router mode is enabled.

`target` / `adapter` behavior:

- `target` is the shorthand deployment target. Phase 1 defaults loaded config to `target: 'static'`.
- `adapter` is the explicit adapter object form and is mutually exclusive with `target`.
- `static` emits the built files and no cache policy. It cannot set `Cache-Control` on an external server.
- `static-export` emits rewrite-free concrete public files rooted at `outDir` and requires `exportPaths` for dynamic prerender routes. It also emits no cache policy.
- `vercel-static` emits a Vercel Build Output API layout rooted at `outDir`. `config.json` sets `Cache-Control: public, max-age=31536000, immutable` on proven content-hashed assets only, before `handle: filesystem`.
- `netlify-static` emits a Netlify publish directory rooted at `outDir`, including generated `_redirects` rewrites for dynamic prerendered routes and a merged `_headers` file for that same immutable asset policy.
- `vercel` emits a Vercel Build Output API layout with packaged route functions for server-classified routes and static rewrites for prerendered dynamic routes. Hashed-asset cache routes are the same shape as `vercel-static`. An authorized Vercel deployment is required to verify the live CDN headers; `config.json` is what the build checks.
- `netlify` emits a deploy root with `publish/`, `functions/`, `netlify.toml`, and generated `_redirects` that force server-classified routes through packaged functions. `publish/_headers` carries the immutable asset policy and keeps a user `_headers` file from `public/`.
- `node` emits a standalone Node artifact rooted at `outDir` with `index.js`, `package.json`, `manifest.json`, `static/`, and `server/`. The server sets immutable `Cache-Control` for manifest-listed hashed assets and `public, max-age=0, must-revalidate` for other static files.

Supported deployment targets:

- `static`
- `static-export`
- `vercel-static`
- `netlify-static`
- `vercel`
- `netlify`
- `node`

Server-capable target contract:

- Route classification stays upstream in the manifest and server package layers.
- `.zenith-output/server` is the canonical packaged server contract consumed by adapters.
- Adapters package classified output into host layouts; they do not reinterpret route meaning.

Current limitations:

- There is no separate `assetPrefix` knob. Assets intentionally follow `basePath`.
- `static-export` does not expose deployed `/_zenith/image` or `/__zenith/route-check` endpoints. A plain static file server is the contract.
- `node`, `vercel`, and `netlify` expose deployed `/_zenith/image` endpoints on the packaged image contract.
- Hosted `vercel` and `netlify` targets expose advisory `/__zenith/route-check` for guarded soft navigation; direct HTML requests remain the server-side route boundary.
- Image materialization is route-artifact-driven. Bundler owns final build/static HTML image materialization, while preview and server render still materialize at runtime from structured `image_materialization` metadata. No path executes page assets, and dynamic image props are currently unsupported until the compiler emits a dedicated image-props artifact.
- Extension discovery commands are read-only; they do not install packages or mutate `zenith.config`.
- Immutable caching covers manifest-proven content hashes only. Helper modules under `assets/modules/`, component assets, and extra vendor chunks are included when a listed asset imports them. Unreachable hashed files stay non-immutable. `static` and `static-export` emit no cache headers. Live Vercel headers require an authorized deployment to verify.

## Commands

### `zenith plugin`
- `zenith plugin list` — official registry plugins
- `zenith plugin search <term>` — metadata search
- `zenith plugin info <name|alias>` — registry metadata and local `package.json` `zenith` block if installed

### `zenith adapter`
- `zenith adapter list` — built-in host targets and deployment target names

### `zenith dev`
Starts the development server on `localhost:3000`.

Changes to `zenith.config.js` or `zenith.config.ts` require restarting `zenith dev`. If the dev watcher observes a config-file edit, it reports the restart policy instead of rebuilding with stale config.

### `zenith build`
Compiles and bundles your application for production.

### `zenith preview`
Previews the locally built target contract for verification. Static targets serve built files; `target: 'node'` boots the built Node artifact.

Preview and the standalone Node server use the same static cache policy: `public, max-age=31536000, immutable` for proven content-hashed assets on the build manifest `assets.immutable`, and `public, max-age=0, must-revalidate` for other static files. Preview loads `.zenith-output/manifest.json` at startup. The Node artifact loads the packaged copy of that manifest. HTML rewritten by preview, route-check, resource routes, SSR, and the image endpoint are unchanged. `Vary` and `Content-Encoding` stay beside `Cache-Control`. `static` and `static-export` emit no cache headers. Hashed `assets/modules/` and vendor chunk files are immutable only when a listed asset imports them; anything the manifest walk cannot see stays revalidated.

Preview and the standalone Node server negotiate `Accept-Encoding` for compressible static text (html, css, js, mjs, json, svg, xml, txt, map, and webmanifest) of at least 1024 bytes. Accepted codings are preferred as Brotli, then gzip, then identity. `q=0` excludes a coding. Responses that can vary send `Vary: Accept-Encoding`, including identity. `Content-Encoding` is omitted for identity. `Content-Length` is the size of the bytes on the wire, and `HEAD` repeats those headers with an empty body. `Range` is not implemented; the full file is returned with status 200. Text types include `charset=utf-8`. Small files, images, fonts, wasm, archives, resource routes, route-check, the image endpoint, and dynamic SSR or rewritten HTML responses are not compressed. Prerendered HTML that is served as a static file is compressed. Encoding is cached in memory for the process. Builds do not emit `.br` or `.gz` files. Brotli quality 11 is a local choice and is not a byte-for-byte Vercel match. Vercel and Netlify adapters leave compression to the CDN.

## Installation

Typically installed as a dev dependency in your Zenith project:

```bash
bun add -d @zenithbuild/cli
```

Projects using `<Image>` also install `@zenithbuild/image` at the exact same
framework train version. It is optional for JPG/JPEG/PNG/WebP/AVIF assets in
`public/`, which are copied unoptimized without it:

```bash
npm i -D @zenithbuild/image@0.9.0-rc.0
```

The 0.9.0 release candidates publish under the npm `train` dist-tag, not `latest`.

The optional package owns the component and Sharp processing. No-image projects
need neither package nor Sharp. Missing image dependencies fail before compilation
or output removal. Generated Node image artifacts declare their own Sharp runtime
dependency; install dependencies in that output before starting it elsewhere.

## License

MIT
