---
title: "Create Contract"
description: "Deterministic scaffolding contract for create-zenith."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "create-zenith", "scaffolding"]
---

# Create Contract

## ZEN-RULE-112: Scaffolder Generates Files, Then Exits

Contract: `create-zenith` is a deterministic scaffolder, not an orchestration/runtime layer.

Banned:
- Compiler/runtime/build logic in scaffolder.
- Nondeterministic generated output.

Definition of Done:
- Same preset + name yields deterministic file tree.
- Version authority is explicit and static.

Canonical source: `/Users/judahsullivan/Personal/zenith/create-zenith/CREATE_CONTRACT.md`.
