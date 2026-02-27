---
title: "Reactivity Model"
description: "Parent vs component scope, local state boundaries, and slot scope guarantees."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["reactivity", "state", "scope"]
---

# Reactivity Model

## ZEN-RULE-101: Local State Is Allowed

Contract: component-local state is valid for self-contained UI behavior.

Invariant: local state may control component-owned markup without requiring parent ownership.

Definition of Done:
- Local state is declared in component scope.
- State transitions remain deterministic and cleanup-safe.

## ZEN-RULE-102: Controlled Props Override Local State

Contract: when a controlling prop is provided (for example `open`, `value`), it is the source of truth.

Invariant: controlled props take precedence over local defaults.

Definition of Done:
- Components resolve actual state via controlled-first fallback logic.
- Parent override is honored whenever control props are present.

## ZEN-RULE-103: State Changes Emit Change Events

Contract: component state transitions should emit `onXChange` callbacks when provided.

Invariant: event payload reports the next resolved value.

Definition of Done:
- `onOpenChange`, `onValueChange`, and similar callbacks are called on change.
- Emission behavior is consistent for controlled and uncontrolled modes.

## ZEN-RULE-104: Slot Scope Preserves Parent Ownership

Contract: slot expressions stay in parent scope.

Invariant: component-local state does not implicitly leak into slot expression resolution.

Definition of Done:
- Slot content resolves against parent declarations.
- Component state only affects component-owned markup unless explicitly passed out.

## Event Rule Alignment

ZEN-RULE-023 remains mandatory: events are object-based only (`on:*={handler}`).

## See Also

- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
- [Bindings and Expressions](/docs/syntax/bindings-expressions)
- [Primitives and Patterns](/docs/reference/primitives-patterns)
