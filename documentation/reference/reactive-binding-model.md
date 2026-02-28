---
title: "Reactive Binding Model"
description: "Reference mental model for signals, markers, and binding tables."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["reference", "runtime", "reactivity"]
---

# Reactive Binding Model

## ZEN-RULE-108: Bindings Are Positional, Never Name-Resolved

Contract: runtime consumes compiler-authored binding tables by index.

Invariant: signals/markers/bindings map deterministically via emitted payload order.

Definition of Done:
- Runtime never resolves identifiers by name.
- No eval/new Function paths exist.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-runtime/REACTIVE_BINDING_MODEL.md`.

## State and Derived Contracts

- `state` declarations are compile-time lowered into runtime reactive primitives.
- Derived values are expressed with `memo(...)` / `zenMemo(...)`.
- Template bindings consume derived/state values through compiler-emitted binding slots.
- Stateful UI components may use controlled/uncontrolled resolution (`value`/`defaultValue`/`onValueChange`, `open`/`defaultOpen`/`onOpenChange`).

## Effect Boundaries

- `zeneffect(...)` is the reactive side-effect boundary.
- `zenMount(...)` is the mount/unmount boundary for setup and teardown.
- Animation engines (for example GSAP) should be driven from these boundaries and cleaned up on rerun/unmount.

## Event Contract

- Event handlers must be object-based (`on:click={handler}`).
- String handlers (`onclick` attributes) are forbidden.

## Scope Contract

- Slot expressions resolve in parent scope.
- Component-local state only affects component-owned markup unless explicitly passed through props/events.

## Global Access Guard

Component scripts must not rely on direct `window.*` / `document.*` access patterns.  
Use `zenWindow()` and `zenDocument()` for SSR-safe global access.
