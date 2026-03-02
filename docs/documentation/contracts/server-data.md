---
title: "Server Data Contract"
description: "Allowed server exports, load context shape, and serialization constraints."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["server", "data", "contracts"]
---

# Server Data Contract

## Contract: Allowed Server Exports

Contract: Supported `<script server>` exports are `data`, `load(ctx)`, and optional `prerender`.

Invariant: New server exports do not mix with deprecated server export variants in the same file.

Banned:
- Exporting both `data` and `load` in one file.
- Server exports outside the public contract.

Definition of Done:
- Exactly one payload source is defined.
- `load` uses one argument (`ctx`).

Failure Modes:
- Mixed exports produce ambiguous payload ownership.
- Invalid load signature prevents deterministic context access.

Evidence:
- Build-time server export validation rejects mixed or invalid patterns.

## Contract: Serialization Rules

Contract: Server payload is a top-level plain object with JSON-safe values.

Invariant: Non-serializable values fail with explicit diagnostics.

Banned:
- Circular payload objects.
- Payload members with unsupported runtime types.
- Prototype pollution keys.

Definition of Done:
- Payload serialization is deterministic and lossless.
- Error envelopes are explicit when load fails.

Failure Modes:
- Silent payload coercion.
- Sensitive values leaking to client payload.

Evidence:
- Serialization guard tests fail on unsupported payload values.
