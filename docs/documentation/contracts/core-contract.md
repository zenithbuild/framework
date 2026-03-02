---
title: "Core Contract"
description: "Deterministic utility substrate boundaries for @zenithbuild/core."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "core", "determinism"]
---

# Core Contract

## ZEN-RULE-101: Core Is Utility-Only

Contract: `@zenithbuild/core` is a deterministic utility substrate.

Invariant: Core must not own routing, runtime orchestration, bundling, or compiler behavior.

Definition of Done:
- Core exports pure helpers (hashing, ordering, path normalization, config/schema validation).
- Core has no framework-layer imports.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-core/CORE_CONTRACT.md`.
