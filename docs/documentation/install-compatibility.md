---
title: "Install and Compatibility"
description: "Supported install flow and compatibility guarantees for Zenith stable and beta scaffolds."
version: "0.5"
status: "canonical"
last_updated: "2026-07-03"
tags: ["install", "compatibility", "release"]
section: "Getting Started"
sectionOrder: 1
order: 2
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

`@zenithbuild/compiler` and `@zenithbuild/bundler` install native binaries through platform-specific optional dependencies. The native binary is required for `zenith dev` and `zenith build`.

### Supported platform matrix

| OS | Architecture | Platform key | Compiler package | Bundler package |
| --- | --- | --- | --- | --- |
| macOS | Apple Silicon | `darwin-arm64` | `@zenithbuild/compiler-darwin-arm64` | `@zenithbuild/bundler-darwin-arm64` |
| macOS | Intel | `darwin-x64` | `@zenithbuild/compiler-darwin-x64` | `@zenithbuild/bundler-darwin-x64` |
| Linux | x86_64 | `linux-x64` | `@zenithbuild/compiler-linux-x64` | `@zenithbuild/bundler-linux-x64` |
| Windows | x86_64 | `win32-x64` | `@zenithbuild/compiler-win32-x64` | `@zenithbuild/bundler-win32-x64` |

These eight packages are the complete supported set: they are the only platform packages published by the release workflow and the only ones the CLI resolves as native binaries. The Linux x86_64 binary is built against musl and statically linked, so the same `linux-x64` package works on both glibc and Alpine/musl Linux distributions.

### Unsupported platforms

No native package is published for any other platform or architecture. Notably unsupported:

| Platform key | Status |
| --- | --- |
| `linux-arm64` | Not supported (no native package published) |
| `win32-arm64` | Not supported (no native package published) |
| any other `platform-arch` | Not supported (no native package published) |

On an unsupported platform the matching optional dependency does not install, so no native compiler or bundler binary is available. With no binary available, `zenith dev` and `zenith build` cannot run, and the CLI reports a clear error that points back to this page, for example: `Bundler binary not installed for linux/arm64. Reinstall @zenithbuild/bundler and ensure the matching platform package is installed.`

To use Zenith on an unsupported platform you must supply a working binary yourself. The CLI resolves binaries in this order:

1. `ZENITH_COMPILER_BIN` / `ZENITH_BUNDLER_BIN` env overrides pointing at binaries you built from source. See [Toolchain Overrides](#toolchain-overrides).
2. The installed platform package binary (none on an unsupported platform).
3. A legacy installed `target/release` binary.
4. A monorepo workspace `target/release` binary. Build from source with `cargo build --release` in `packages/compiler` and `packages/bundler` to produce these.

Adding native targets such as `linux-arm64` or `win32-arm64` is a separate release-engineering decision and is not part of this milestone. Track platform expansion in its own issue rather than expecting it here.

### Recovering from a wrong-platform install

If a native binary is missing or the wrong OS package was installed:

1. Delete `node_modules` and the lockfile if your package manager cached the wrong optional dependency.
2. Reinstall from the project root.
3. Re-run `npx zenith build`.

The CLI also detects an incompatible (wrong-platform) binary at run time (for example an `exec format error` or `bad cpu type`) and falls back to the next available candidate with a warning. If every candidate is missing or incompatible, it errors with a link to this page.

## Toolchain Overrides

For debugging or CI pinning, the CLI accepts direct binary overrides:

- `ZENITH_COMPILER_BIN=/abs/path/to/zenith-compiler`
- `ZENITH_BUNDLER_BIN=/abs/path/to/zenith-bundler`

The CLI prefers those overrides first, then the matching platform package, then legacy binaries from older installs, then monorepo workspace fallbacks.
