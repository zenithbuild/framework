---
title: "Compiler Boundary Contract"
description: "Hard limits for compiler responsibilities and forbidden behavior."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "compiler", "boundaries"]
---

# Compiler Boundary Contract

## ZEN-RULE-102: Compiler Decides Structure, Not Runtime

Contract: Compiler resolves structure at compile time and emits deterministic plans.

Banned:
- Runtime AST parsing or scope resolution fallback.
- Compiler-side component runtime wrappers.
- Hidden framework abstractions.

Definition of Done:
- Parse -> scope -> safety -> lowering -> emission remains deterministic.
- Impossible behavior fails at compile time.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-compiler/COMPILER_BOUNDARY.md`.
