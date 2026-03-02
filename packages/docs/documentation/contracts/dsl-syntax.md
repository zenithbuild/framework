---
title: "DSL Syntax Contract"
description: "Canonical Zenith syntax rules including event binding and expression safety constraints."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["dsl", "syntax", "events", "contracts"]
---

# DSL Syntax Contract

## Contract: Event Binding

Contract: Event bindings are object-based and use `on:event={handler}` syntax.

Invariant: Event handlers are expressions, not string instructions.

Definition of Done:
- Event wiring uses `on:click={...}` style bindings.
- Handler expressions resolve through compile-time scope analysis.

Failure Modes:
- String-like event attributes are used as handler payloads.
- Non-Zenith event syntaxes appear in canonical examples.

Evidence:
- Compiler safety checks reject unsupported event forms.

## Contract: Markup Expressions

Contract: Expressions inside markup can render primitive values and renderables without string fallbacks.

Invariant: Non-renderable objects do not coerce into UI text.

Banned:
- Runtime HTML string parsing for expression output.
- Silent coercion of object arrays into text output.

Definition of Done:
- Mapped collections produce nodes.
- Invalid renderables fail fast with explicit errors.

Failure Modes:
- Raw expression source appears in rendered DOM text.
- Object coercion text appears in output.

Evidence:
- Runtime and site regression tests prevent expression leaks and object coercion.
