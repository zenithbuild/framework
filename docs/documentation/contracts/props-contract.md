---
title: "Props Contract"
description: "Compile-time props ownership and runtime pass-through contract."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "compiler", "props"]
section: "Advanced"
sectionOrder: 8
order: 2
---

# Props Contract

## ZEN-RULE-104: Props Are Explicit Payload, Never Runtime Discovery

Contract: props are serialized by compiler and passed through bundler/runtime without reinterpretation.

Banned:
- Runtime prop inference from DOM.
- Implicit prop reactivity conversion.
- Runtime evaluation of dynamic props for Component Server Values.

Definition of Done:
- Compiler owns props serialization.
- Runtime consumes props as explicit factory inputs only.
- Scoped component server data accepts only static literal props in v1; dynamic expressions, spreads, functions, event handlers, and member expressions fail before output.

Canonical source: `packages/compiler/PROPS_CONTRACT.md`.
