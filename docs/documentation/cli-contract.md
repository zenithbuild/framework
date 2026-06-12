---
title: "CLI Contract"
description: "Public CLI guarantees for command behavior, exit semantics, and deployment-aware build outputs."
version: "0.5"
status: "canonical"
last_updated: "2026-06-07"
tags: ["contracts", "cli", "commands"]
---

# CLI Contract

## ZEN-RULE-113: CLI Is Orchestration, Not Framework Runtime

Contract: the CLI owns deterministic build/dev/preview orchestration only.

Invariant: CLI must not implement compiler semantics, runtime behavior, or hidden navigation logic.

## Command Guarantees

| Command | Guarantee |
| --- | --- |
| `zenith --version` | prints version and exits `0` before package checks |
| `zenith --help` | prints usage and exits `0` before package checks |
| `zenith dev` | starts development server and rebuild loop |
| `zenith build` | emits deterministic build output for the selected deployment target |
| `zenith preview` | serves or boots the built target output without compilation |
| `zenith plugin list` | lists official plugins from `@zenithbuild/extension-registry` |
| `zenith plugin search <term>` | searches registry metadata only (no network crawl) |
| `zenith plugin info <name\|alias>` | shows registry metadata and local `package.json` `zenith` block if installed |
| `zenith adapter list` | lists registry adapters and built-in deployment targets |

Read-only plugin/adapter commands must not import or execute extension package entrypoints. Install and config-mutation commands are not part of the current CLI surface.

## Output Contract

`zenith build` writes canonical intermediate output to `.zenith-output/` and then adapts it into the selected target layout under `outDir`.

`basePath` is part of that output contract:

- canonical route identities remain base-path free
- `.zenith-output/manifest.json` carries `base_path`
- public asset URLs and framework endpoints are prefixed by `basePath`
- `zenith preview` must honor the same base-path behavior as the built target

Today the supported target names are:

- `static`
- `static-export`
- `vercel-static`
- `netlify-static`
- `vercel`
- `netlify`
- `node`

`zenith preview` is target-aware. It previews the built target contract rather than assuming every build is a plain static site.

Canonical source: `packages/cli/CLI_CONTRACT.md`.

See also:
- [HMR V1 Contract](/docs/contracts/hmr-v1-contract)
- [Deployment Targets Guide](/docs/guides/deployment-targets)
