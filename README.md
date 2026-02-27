# `@zenithbuild/core`

This is the **sole public entrypoint** for the Zenith framework. 

## Canonical Docs

- Core contract: `../zenith-docs/documentation/contracts/core-contract.md`
- Zenith contract: `../zenith-docs/documentation/zenith-contract.md`

Use this package directly in your projects to run Zenith utilities and access the official APIs.

## Installation

```bash
npm install @zenithbuild/core
```

## Running the CLI

The `.bin` wrapper is exposed as `zenith`. Running `npx zenith dev` or `npx zenith build` executes the corresponding framework command.

## Internal Dependencies

For developers: DO NOT import any other `@zenithbuild/*` packages directly (e.g. `@zenithbuild/compiler`, `@zenithbuild/runtime`, `@zenithbuild/cli`). All needed features are either opaque implementation details or safely exposed through exports here. Direct access of inner implementation details is strictly forbidden.
