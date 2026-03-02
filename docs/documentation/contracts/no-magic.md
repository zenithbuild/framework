---
title: "No Magic Contract"
description: "Explicit framework behavior only: no hidden globals, auto-resolution, or regex injection."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["contracts", "compiler", "no-magic"]
---

# No Magic Contract

## Contract: Explicit Inputs Only

Contract: Compiler and runtime behavior must depend on explicit source inputs and declared APIs.

Invariant: No hidden globals provide route data, params, or load context.

Banned:
- Hidden data context injection.
- Regex rewriting that injects framework behavior into app templates.
- Automatic component resolution outside declared imports.

Definition of Done:
- Components receive only declared props and imports.
- Server context is available only through `load(ctx)`.

Failure Modes:
- Route behavior changes based on implicit global variables.
- Build output changes due to undocumented rewrite rules.

Evidence:
- Compiler and CLI tests enforce strict export and binding contracts.
