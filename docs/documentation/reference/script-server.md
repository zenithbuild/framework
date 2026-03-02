---
title: "Script Server Reference"
description: "Public contract for `<script server>` exports and context access."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["reference", "server", "script-server"]
---

# Script Server Reference

## Contract: Supported Exports

Contract: `<script server>` supports `data`, `load(ctx)`, and optional `prerender`.

Invariant: `load` accepts exactly one argument and returns JSON-safe object payload.

Definition of Done:
- Public examples use only allowed exports.
- Context access happens through `ctx` argument.

Failure Modes:
- Multiple payload exports conflict.
- Runtime depends on undeclared context globals.

Evidence:
- Server export validation tests enforce allowed combinations and signatures.

## Contract: Context Shape

Contract: `ctx` includes `params`, `url`, `request`, and route metadata.

Invariant: Route metadata is deterministic per matched request.

Definition of Done:
- Examples show explicit access through `ctx.params` and `ctx.route`.
- No ambient context assumptions in server docs.

Failure Modes:
- Route parameters are read from implicit globals.
- Route metadata shape varies across environments.

Evidence:
- Dev/preview route tests validate parity for route metadata and params.
