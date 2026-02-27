---
title: "Zenith Contract"
description: "Top-level framework laws and precedence rules for compile-time-first behavior."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "governance", "compiler-first"]
---

# Zenith Contract

## ZEN-RULE-001: Compile-Time First

Contract: anything decidable at compile time must not be deferred to runtime.

Invariant: runtime is execution-only, not interpretation-only fallback.

## ZEN-RULE-002: Determinism Is Non-Negotiable

Contract: same input produces same output across environments.

Invariant: generated artifacts must not leak machine-local paths or nondeterministic ordering.

## ZEN-RULE-003: No Framework Drift

Banned:
- React/Vue/Svelte/Solid syntax and primitives in canonical Zenith examples.
- String event handlers in Zenith code examples.
- Hidden globals and regex-magic behavior.

For package-level boundaries, see canonical contracts in `documentation/contracts/**` and references in `documentation/reference/**`.

## ZEN-RULE-101: Local State Is Allowed

Contract: components may declare local state for self-contained UI behavior.

Invariant: local state is valid unless a controlling prop is explicitly provided.

## ZEN-RULE-102: Controlled Props Override Local State

Contract: control props (for example `open`, `value`) are the source of truth when present.

Invariant: component resolution follows controlled-first fallback logic.

## ZEN-RULE-103: Changes Emit `onXChange`

Contract: state transitions emit change callbacks (`onOpenChange`, `onValueChange`) when provided.

Invariant: callback payload is the next resolved value.

## ZEN-RULE-104: Slot Scope Remains Parent-Owned

Contract: slot content resolves in parent scope.

Invariant: component-local state does not implicitly rebind slot expressions.

## ZEN-RULE-023: Event Binding Is Object-Based

Contract: events are `on:*={handler}` only.

Banned:
- `onclick` string attributes
- `onClick` React-style props
- `@click` Vue-style attributes

See also:
- `/docs/reactivity/reactivity-model`
- `/docs/reactivity/controlled-uncontrolled-components`
- `/docs/syntax/bindings-expressions`
