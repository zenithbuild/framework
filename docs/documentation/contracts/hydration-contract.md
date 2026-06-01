---
title: "Hydration Contract"
description: "Deterministic hydration payload and hard-fail semantics."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "runtime", "hydration"]
---

# Hydration Contract

## ZEN-RULE-107: Hydration Is Explicit and Deterministic

Contract: hydration consumes explicit payload tables with stable index alignment.

Component Server Values hydrate from serialized Scoped Server Data slices keyed by owner/runtime metadata. Missing scoped slices fail deterministically instead of falling back to empty data.

Banned:
- Runtime discovery passes.
- Fallback behavior for broken payload contracts.
- Client refetch or client execution of scoped server values during hydration.

Definition of Done:
- Payload validation throws on drift.
- Marker/expression/event ordering is preserved exactly.

Canonical source: `packages/runtime/HYDRATION_CONTRACT.md`.
