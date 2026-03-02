---
title: "Zenith Contract"
description: "Top-level framework laws and precedence rules for compile-time-first behavior."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["contracts", "governance", "compiler-first"]
nav:
  order: 5
---

# Zenith Contract

## ZEN-RULE-001: Compile-Time First

Anything decidable at compile time must not be deferred to runtime.

## ZEN-RULE-002: Determinism Is Non-Negotiable

The same input must produce the same output across environments.

## ZEN-RULE-003: No Framework Drift

Canonical examples must not drift into non-Zenith framework syntax or primitives.

## ZEN-RULE-200: Universal Event Model

Any element may bind any DOM event via `on:<event>={handler}`.

## ZEN-RULE-201: Event Handler Safety

Event handlers must be function-valued expressions. String handlers and direct call expressions are compile-time errors.

## ZEN-RULE-210: Hover Alias Contract

`hoverin` and `hoverout` are aliases for `pointerenter` and `pointerleave`.

## ZEN-RULE-220: Escape Alias Contract

`esc` is a key-filter alias for Escape over keydown, using document-level runtime dispatch for reliability.

## ZEN-RULE-300: Slot Scope Preservation

Slot expressions always preserve parent scope.

## ZEN-RULE-301: Local Scope Isolation

Component-local state does not implicitly rebind slot expressions.

## ZEN-RULE-320: Controlled-First Resolution

Controlled props (`open`/`value`) override internal state; changes emit `onXChange` callbacks.

## See Also

- [Events](/docs/syntax/events)
- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
- [Using AI with Zenith](/docs/guides/using-ai-with-zenith)
