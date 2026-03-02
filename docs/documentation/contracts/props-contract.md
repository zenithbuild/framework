---
title: "Props Contract"
description: "Compile-time props ownership and runtime pass-through contract."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "compiler", "props"]
---

# Props Contract

## ZEN-RULE-104: Props Are Explicit Payload, Never Runtime Discovery

Contract: props are serialized by compiler and passed through bundler/runtime without reinterpretation.

Banned:
- Runtime prop inference from DOM.
- Implicit prop reactivity conversion.

Definition of Done:
- Compiler owns props serialization.
- Runtime consumes props as explicit factory inputs only.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-compiler/PROPS_CONTRACT.md`.
