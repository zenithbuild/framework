---
title: "Bundler Contract"
description: "Deterministic bundler emission and zero-semantic-transform guarantees."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "bundler", "determinism"]
---

# Bundler Contract

## ZEN-RULE-110: Bundler Must Not Reinterpret Compiler Semantics

Contract: bundler performs deterministic structural emission only.

Banned:
- Semantic rewriting of compiler output.
- Hidden app-specific logic injection.

Definition of Done:
- Export/data-attribute contracts are preserved.
- Hashing and ordering remain deterministic.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-bundler/BUNDLER_CONTRACT.md`.
