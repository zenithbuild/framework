---
title: "Install and Compatibility"
description: "Supported install flow and compatibility guarantees for Zenith beta trains."
version: "0.4"
status: "canonical"
last_updated: "2026-03-01"
tags: ["install", "compatibility", "release"]
---

# Install and Compatibility

## ZEN-RULE-114: Clean-Room Scaffold + Build Is the Compatibility Proof

Contract: a beta train is supported when clean-room scaffold, install, and `zenith build` succeed with deterministic outputs.

## Recommended Install

```bash
npx create-zenith@beta my-app
cd my-app
npm install
npx zenith build
```

## Tailwind v4 Setup

Zenith now compiles local Tailwind v4 entry files internally during both `zenith dev` and `zenith build`.

Recommended setup:

```css
/* src/styles/global.css */
@import "tailwindcss";
```

Then import that local file from a page or layout:

```ts
import "../styles/global.css";
```

Rules:
- import a local CSS entry file, not bare `tailwindcss`, from `.zen` scripts
- keep `tailwindcss` and `@tailwindcss/cli` installed in the app project
- do not add `tw:build`, `output.css`, or `tailwind.css` precompile steps to starters or apps
- emitted CSS must not contain raw `@import "tailwindcss"`

## Dev CSS Contract

During `zenith dev`, Zenith serves the compiled stylesheet from:

```txt
/__zenith_dev/styles.css
```

and exposes the cache-busted href via:

```txt
/__zenith_dev/state -> cssHref=/__zenith_dev/styles.css?buildId=<n>
```

This keeps Tailwind compilation internal to the Zenith dev loop and prevents any browser request for a literal `tailwindcss` asset.

## Version Policy

- `@zenithbuild/core` may bump independently for CLI-wrapper fixes.
- Engine packages (compiler, cli, runtime, router, bundler) move together for engine changes.

If internal versions skew, reinstall from a clean dependency state.
