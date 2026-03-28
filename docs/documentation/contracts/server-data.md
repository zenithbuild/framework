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

Contract: Supported `<script server>` exports are optional `guard(ctx)`, optional `action(ctx)`, one payload source (`data` or `load(ctx)`), and optional `prerender`.

Invariant: `guard(ctx)` is the route-protection gate, `action(ctx)` is the canonical POST mutation boundary, and `data` or `load(ctx)` is the payload source. Legacy payload exports may not mix with the canonical surface.

Banned:
- Exporting both `data` and `load` in one file.
- Returning `data(...)` from `guard(ctx)`.
- Mixing `data` or `load` with legacy `ssr_data` / `props` / `ssr` exports.
- Combining `action(ctx)` with `prerender = true`.
- Server exports outside the public contract.

Definition of Done:
- At most one payload source is defined.
- `guard(ctx)`, `action(ctx)`, and `load(ctx)` each use exactly one argument.
- Expected mutation validation failures return `invalid(payload, 400|422)` and re-render through the same route payload path.

Failure Modes:
- Mixed payload exports produce ambiguous ownership.
- Invalid `guard` / `action` / `load` signatures break deterministic context access.
- Mutation handlers turn into ad hoc RPC surfaces instead of route-owned form posts.

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
