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

Contract: `<script server>` may export optional `guard(ctx)`, optional `action(ctx)`, one payload source (`data` or `load(ctx)`), and optional `prerender`.

Invariant: A page uses exactly one payload source (`data` or `load`). `guard(ctx)` may short-circuit access before payload resolution. `action(ctx)` is the single canonical POST mutation hook.

Banned:
- Mixed payload source exports.
- `guard(ctx)` returning `data(...)`.
- `action(ctx)` returning undeclared ad hoc transport objects instead of `data(...)`, `invalid(...)`, `redirect(...)`, or `deny(...)`.
- Non-contract server exports used as page payload channels.

Definition of Done:
- Export combinations pass server contract validation.
- `guard(ctx)`, `action(ctx)`, and `load(ctx)` each accept exactly one `ctx` argument.
- `prerender` is boolean when present.

Failure Modes:
- Invalid export sets create ambiguous payload ownership.
- Unsupported export names bypass validation.
- Mutation failures escape the route lifecycle instead of re-rendering the route with `ctx.action`.

Evidence:
- Server export validation tests enforce allowed combinations.

## Contract: Load Context and Serialization

Contract: `load` accepts one argument (`ctx`) containing request URL, params, request object, route metadata, and action state.

Invariant: Returned payload is a JSON-safe top-level plain object.

Banned:
- Non-serializable payload members.
- Cyclic payload graphs.

Definition of Done:
- Payload serializes deterministically.
- Invalid payloads fail with explicit diagnostics.
- POST action requests expose `ctx.action` to `load(ctx)` as either `null`, `{ ok: true, status: 200, data }`, or `{ ok: false, status: 400|422, data }`.

Failure Modes:
- Silent coercion of unsupported payload values.
- Route metadata inconsistency between environments.

Evidence:
- Serialization and route parity checks pass for representative routes.
