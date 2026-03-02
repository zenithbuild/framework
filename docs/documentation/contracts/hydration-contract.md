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

Banned:
- Runtime discovery passes.
- Fallback behavior for broken payload contracts.

Definition of Done:
- Payload validation throws on drift.
- Marker/expression/event ordering is preserved exactly.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-runtime/HYDRATION_CONTRACT.md`.
