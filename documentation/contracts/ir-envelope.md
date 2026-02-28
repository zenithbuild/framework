---
title: "IR Envelope Contract"
description: "Compiler-to-bundler/runtime envelope shape and version gate."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "compiler", "ir"]
---

# IR Envelope Contract

## ZEN-RULE-103: IR Version Gate Is Mandatory

Contract: compiler emits a canonical IR envelope with explicit `ir_version`.

Invariant: bundler/runtime must hard-fail on unsupported versions.

Definition of Done:
- Envelope shape remains deterministic.
- Any shape change increments IR version and updates validators/tests.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-compiler/IR_ENVELOPE_CONTRACT.md`.
