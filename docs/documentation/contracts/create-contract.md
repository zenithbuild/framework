---
title: "Create Contract"
description: "Deterministic scaffolding contract for create-zenith."
version: "0.4"
status: "canonical"
last_updated: "2026-03-02"
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
- Optional tooling is additive only. If a user declines ESLint or Prettier, the generated project must contain zero references to that tool.

Canonical source: `/Users/judahsullivan/Personal/zenithbuild-monorepo/packages/create-zenith/CREATE_CONTRACT.md`.
