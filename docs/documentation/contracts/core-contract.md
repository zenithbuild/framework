---
title: "Core Contract"
description: "Deterministic utility substrate boundaries for @zenithbuild/core."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "core", "determinism"]
---

# Core Contract

## ZEN-RULE-101: Core Is The Public Package Boundary For Deterministic Utilities

Contract: `@zenithbuild/core` is the public Zenith package boundary for apps plus deterministic shared utilities.

Invariant: Core may own config validation/types and shared helpers, but it must not own routing, runtime orchestration, bundling, or compiler semantics.

Definition of Done:
- Core exports the public config/type/helper surface truthfully.
- Core keeps browser APIs, hidden config defaults, and eval-like behavior out of the shared layer.

Canonical source: `packages/core/CORE_CONTRACT.md`.
