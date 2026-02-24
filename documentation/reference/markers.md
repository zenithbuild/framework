---
title: "Marker Reference"
description: "What data-zx markers represent and what guarantees they provide."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["reference", "markers", "runtime"]
---

# Marker Reference

## Contract: Marker Semantics

Contract: Marker attributes identify compile-time lowered bindings and hydration anchors.

Invariant: Marker names and structure are compiler-emitted and deterministic for a given source.

Definition of Done:
- Marker presence is stable for equivalent source input.
- Runtime consumes marker metadata without introducing hidden behavior.

Failure Modes:
- Markers are repurposed as app-level API surface.
- Marker-driven behavior diverges from compiled binding plan.

Evidence:
- Compiler and runtime contract tests validate marker generation and consumption.

## Contract: Scope Boundaries

Contract: Markers are framework internals, not user-defined routing or data channels.

Invariant: App behavior does not depend on ad hoc marker mutation.

Definition of Done:
- Public docs treat markers as diagnostics/implementation detail.
- Examples do not require manual marker authoring by users.

Failure Modes:
- Docs suggest adding markers manually for behavior.
- Runtime expects non-compiler markers for correctness.

Evidence:
- Framework examples compile and hydrate without manual marker edits.
