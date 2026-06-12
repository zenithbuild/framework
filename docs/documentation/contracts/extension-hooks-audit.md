---
title: "Extension Hooks Audit"
description: "Shipped vs blocked vs future Zenith extension hooks."
version: "0.1"
status: "canonical"
last_updated: "2026-06-07"
tags: ["contracts", "plugins", "extensions", "adapters"]
---

# Extension Hooks Audit

This document records what the framework supports today versus what remains blocked or future work.

## Shipped today

### Config-time plugins (V1)

- `plugins: [{ name, config? }]` in `zenith.config.ts` / `zenith.config.js`
- `config()` may return a conservative patch for: `router`, `embeddedMarkupExpressions`, `typescriptDefault`, `strictDomLints`, `images`, `basePath`, `outDir`
- Plugin hooks run only during `loadConfig()`

### Deployment adapters

- Built-in `target` values resolved inside `@zenithbuild/cli`
- Advanced inline `adapter: { name, validateRoutes, adapt }` object (mutually exclusive with `target`)

### CLI extension discovery (read-only)

- `zenith plugin list|search|info`
- `zenith adapter list`
- Metadata sourced from `@zenithbuild/extension-registry` only
- `zenith plugin info` may read installed `package.json` `zenith` metadata; it must not import extension entrypoints

## Blocked / not public

- Compiler AST / IR / transform hooks
- Bundler mutation hooks
- Dev-server mutation hooks
- Runtime / DOM lifecycle hooks
- Router `beforeEach` / middleware plugin registration
- Plugin middleware registration via config plugins
- Executing extension package entrypoints during `list` / `search` / `info`

## Future (requires separate contract work)

- `@zenithbuild/plugin-api` runtime hook registry (`build:start`, `build:assets`, etc.)
- Future CLI install commands: `zenith plugin add|remove`, `zenith adapter add`
- Conservative `zenith.config` patching for installed extensions
- First-party `@zenithbuild/plugin-*` and `@zenithbuild/adapter-*` packages with `installable: true`
- Community registry index (cached manifest; no live GitHub crawl in CLI)
- Future `zenith plugin create` / `zenith adapter create` canonical templates tied to published packages
