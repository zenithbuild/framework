# @zenith/runtime

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.


The core runtime library for the Zenith framework.

## Canonical Docs

- Runtime contract: `../zenith-docs/documentation/contracts/runtime-contract.md`
- Hydration contract: `../zenith-docs/documentation/contracts/hydration-contract.md`
- Reactive binding model: `../zenith-docs/documentation/reference/reactive-binding-model.md`

## Overview
This package provides the reactivity system, hydration logic, and Virtual DOM primitives used by Zenith applications. It is designed to be lightweight, fast, and tree-shakeable.

## Features
- **Fine-Grained Reactivity**: Signals, Effects, Derived State (Memos).
- **Hydration**: Efficient client-side hydration of server-rendered HTML.
- **VDOM primitives**: `h` and `fragment` for lightweight view rendering.
- **Lifecycle Hooks**: `onMount`, `onUnmount`.

## Usage
This package is typically installed automatically by the Zenith CLI.
```typescript
import { signal, effect } from "@zenith/runtime";

const count = signal(0);
effect(() => console.log(count()));
```
