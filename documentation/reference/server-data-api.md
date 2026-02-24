---
title: "Server Data API"
description: "Public `<script server>` API for data, load context, and serialization requirements."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["reference", "server", "data"]
---

# Server Data API

## Contract: Export Surface

Contract: `<script server>` may export `data`, `load(ctx)`, and optional `prerender`.

Invariant: A page uses exactly one payload source (`data` or `load`).

Banned:
- Mixed payload source exports.
- Non-contract server exports used as page payload channels.

Definition of Done:
- Export combinations pass server contract validation.
- `prerender` is boolean when present.

Failure Modes:
- Invalid export sets create ambiguous payload ownership.
- Unsupported export names bypass validation.

Evidence:
- Server export validation tests enforce allowed combinations.

## Contract: Load Context and Serialization

Contract: `load` accepts one argument (`ctx`) containing request URL, params, request object, and route metadata.

Invariant: Returned payload is a JSON-safe top-level plain object.

Banned:
- Non-serializable payload members.
- Cyclic payload graphs.

Definition of Done:
- Payload serializes deterministically.
- Invalid payloads fail with explicit diagnostics.

Failure Modes:
- Silent coercion of unsupported payload values.
- Route metadata inconsistency between environments.

Evidence:
- Serialization and route parity checks pass for representative routes.
