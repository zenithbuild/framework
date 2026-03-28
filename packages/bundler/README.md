# @zenithbuild/bundler

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.

Internal bundler package that consumes compiler artifacts and emits page assets, router runtime assets, and packaged server output for the CLI.

## Canonical Docs

- Bundler contract: `../../docs/documentation/contracts/bundler-contract.md`
- Script boundary contract: `../../docs/documentation/contracts/script-boundary.md`

## Overview

This package is consumed by the Zenith CLI. Its contract is internal and centered on deterministic asset emission, not a stable public JS API.

Current responsibilities:

- lowering compiler envelopes into deterministic HTML/JS/CSS assets
- emitting router/runtime support only when required by the manifest
- packaging server-capable artifacts consumed later by adapters
- preserving compiler-owned semantics instead of reinterpreting them downstream

## Testing

```bash
cargo test
```

## License

MIT
