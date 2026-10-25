---
title: "Component Script Hoisting Contract"
description: "Compile-time hoisting, bundler emission, and runtime payload boundaries for component scripts."
version: "0.3"
status: "canonical"
last_updated: "2026-10-25"
tags: ["contracts", "compiler", "runtime", "components"]
section: "Advanced"
sectionOrder: 8
order: 4
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
- Compiler owns `components_scripts[].module_id` (`{source_path}:script{index}`). The CLI forwards it unchanged. The bundler rejects an empty value.
- Bundler deduplicates by `hoist_id`.
- Runtime mounts factories from payload only.

Canonical source: `packages/compiler/COMPONENT_SCRIPT_HOISTING.md`.
