---
title: "Component Script Hoisting Contract"
description: "Compile-time hoisting, bundler emission, and runtime payload boundaries for component scripts."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "compiler", "runtime", "components"]
---

# Component Script Hoisting Contract

## ZEN-RULE-105: Component Scripts Are Compile-Time Artifacts

Contract: component `<script>` blocks are hoisted deterministically and emitted as explicit payload references.

Banned:
- Runtime script parsing.
- Dynamic scope lookup.
- Nondeterministic IDs.

Definition of Done:
- Compiler emits deterministic `hoist_id` + instance ordering.
- Bundler deduplicates by `hoist_id`.
- Runtime mounts factories from payload only.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-compiler/COMPONENT_SCRIPT_HOISTING.md`.
