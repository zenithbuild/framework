# @zenithbuild/runtime

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.

Internal runtime package for Zenith hydration, bindings, and reactive primitives consumed by compiled output.

## Canonical Docs

- Runtime contract: `../../docs/documentation/contracts/runtime-contract.md`
- Hydration contract: `../../docs/documentation/contracts/hydration-contract.md`
- Reactive binding model: `../../docs/documentation/reference/reactive-binding-model.md`

## Overview
This package provides the minimal runtime surfaces needed after compile:

- signal/state/effect/mount primitives
- DOM binding and hydration helpers
- template/runtime bridges consumed by compiler and bundler output

It does not define a public virtual-DOM framework API.

## Features
- **Fine-Grained Reactivity**: signal/state/effect primitives used by emitted code.
- **Hydration**: deterministic client-side hydration for server-rendered HTML.
- **Lifecycle Cleanup**: explicit mount/effect cleanup semantics.

## Usage
This package is installed as an internal framework dependency. App code should normally use the public Zenith surface instead of importing `@zenithbuild/runtime` directly.
