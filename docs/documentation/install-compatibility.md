---
title: "Install and Compatibility"
description: "Supported install flow and compatibility guarantees for Zenith stable and beta scaffolds."
version: "0.4"
status: "canonical"
last_updated: "2026-03-04"
tags: ["install", "compatibility", "release"]
---

# Install and Compatibility

## ZEN-RULE-114: Clean-Room Scaffold + Build Is the Compatibility Proof

Contract: a beta train is supported when clean-room scaffold, install, and `zenith build` succeed with deterministic outputs.

## Recommended Install

```bash
npm create zenith@latest
cd my-app
npm install
npx zenith build
```

`create-zenith` is the canonical scaffold entry point for stable users. Beta installs remain available when explicitly requested.

## Optional Tooling

The scaffold prompts let you opt into:

- ESLint
- Prettier
- TypeScript path aliases

Contract:

- Selecting `Yes` adds the tool's scripts, dependencies, and config files.
- Selecting `No` adds nothing for that tool.
- Generated projects must never contain scripts or config for tools the user declined.

Beta example:

```bash
npx create-zenith@beta my-app
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
- `create-zenith` may publish patch releases independently when scaffold templates or CLI UX change.

If internal versions skew, reinstall from a clean dependency state.

## Native Toolchain Packages

`@zenithbuild/compiler` and `@zenithbuild/bundler` install native binaries through platform-specific optional dependencies.

Supported platform package names:

- `@zenithbuild/compiler-darwin-arm64`
- `@zenithbuild/compiler-darwin-x64`
- `@zenithbuild/compiler-linux-x64`
- `@zenithbuild/compiler-win32-x64`
- `@zenithbuild/bundler-darwin-arm64`
- `@zenithbuild/bundler-darwin-x64`
- `@zenithbuild/bundler-linux-x64`
- `@zenithbuild/bundler-win32-x64`

If a native binary is missing or the wrong OS package was installed:

1. Delete `node_modules` and the lockfile if your package manager cached the wrong optional dependency.
2. Reinstall from the project root.
3. Re-run `npx zenith build`.

## Toolchain Overrides

For debugging or CI pinning, the CLI accepts direct binary overrides:

- `ZENITH_COMPILER_BIN=/abs/path/to/zenith-compiler`
- `ZENITH_BUNDLER_BIN=/abs/path/to/zenith-bundler`

The CLI prefers those overrides first, then the matching platform package, then legacy binaries from older installs, then monorepo workspace fallbacks.
