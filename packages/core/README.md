# `@zenithbuild/core`

This is the public dependency boundary for Zenith applications.

## Canonical Docs

- Core contract: `../../docs/documentation/contracts/core-contract.md`
- Zenith contract: `../../docs/documentation/zenith-contract.md`

Use `@zenithbuild/core` in app projects for:

- the `zenith` CLI entrypoint
- typed `defineConfig()` / `loadConfig()` helpers
- deterministic path/order/hash/error/version utilities
- exported schema and IR helper surfaces that are part of the public package boundary

## Installation

```bash
npm install @zenithbuild/core
```

## Running the CLI

The `.bin` wrapper is exposed as `zenith`. Running `npx zenith dev` or `npx zenith build` executes the corresponding framework command.

## Internal Dependencies

For app code, do not import internal `@zenithbuild/*` implementation packages directly. If a surface is meant to be public, it must be exposed through `@zenithbuild/core` or the canonical docs.
