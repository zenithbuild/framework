---
title: "Runtime Contract"
description: "Sealed runtime interface and prohibited behavior."
version: "0.4"
status: "canonical"
last_updated: "2026-03-29"
tags: ["contracts", "runtime"]
---

# Runtime Contract

## ZEN-RULE-106: Runtime Executes, It Does Not Interpret

Contract: runtime consumes emitted artifacts and performs deterministic binding/hydration only.

Banned:
- Runtime expression parsing or string evaluation.
- Framework lifecycle abstractions beyond explicit mount/unmount.

Definition of Done:
- Runtime behavior is explicit and minimal.
- Contract drift triggers hard errors.

Allowed narrow helper surface:
- `zenPresence(...)` may coordinate phase-based presence for ref-owned, always-mounted nodes.
- `presence(...)` may exist as an optional secondary alias, but `zenPresence(...)` stays canonical.
- It remains a normal runtime import, not a compiler-owned implicit global.
- It may expose narrow phase callbacks such as `onPhaseChange` for node-local coordination.
- It may not retain fragments, delay conditional unmount, or bypass the deterministic patch loop.

Canonical source: `packages/runtime/RUNTIME_CONTRACT.md`.

See also:
- [HMR V1 Contract](/docs/contracts/hmr-v1-contract)
