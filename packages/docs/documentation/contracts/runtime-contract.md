---
title: "Runtime Contract"
description: "Sealed runtime interface and prohibited behavior."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
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

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-runtime/RUNTIME_CONTRACT.md`.

See also:
- [HMR V1 Contract](/docs/contracts/hmr-v1-contract)
