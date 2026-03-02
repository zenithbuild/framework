---
title: "Security and Drift Gates"
description: "Repository gates that prevent unsafe execution paths and contract drift."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["security", "drift-gates", "contracts"]
---

# Security and Drift Gates

## Contract: Runtime Safety

Contract: Framework output must not introduce runtime code evaluation channels.

Banned:
- Dynamic code evaluation primitives.
- Runtime string-to-code conversion paths.

Definition of Done:
- Security drift checks run in CI and local verification.
- Violations fail build and merge checks.

Failure Modes:
- Generated code includes dynamic execution primitives.
- Runtime accepts arbitrary string content as executable behavior.

Evidence:
- Security grep gates report zero matches in generated outputs.

## Contract: Determinism Gates

Contract: Generated artifacts remain deterministic across machines.

Invariant: Output must not contain machine-local paths.

Definition of Done:
- Type artifacts contain no absolute host paths.
- Ordered manifests and indices are stable between runs.

Failure Modes:
- Build artifacts differ by machine path layout.
- Route or docs indices reorder without content changes.

Evidence:
- Determinism checks compare generated output snapshots.
