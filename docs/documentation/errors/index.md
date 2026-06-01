---
title: "Error Reference Index"
description: "Entry point for Zenith compiler and tooling diagnostics."
version: "0.4"
status: "canonical"
last_updated: "2026-05-08"
tags: ["errors", "diagnostics"]
---

# Error Reference Index

Zenith reports compiler-owned diagnostics through structured error and warning codes. Tooling should surface these diagnostics as compiler output, not as editor-only rules.

## Compiler Diagnostics

| Code | Meaning |
| --- | --- |
| `ZEN-SCRIPT-SYNTAX` | Invalid TypeScript syntax inside a Zenith script block. |
| `ZEN-EXPR-SYNTAX` | Invalid markup or attribute expression syntax. |
| `ZEN-EXPR-UNBOUND` | A markup expression references a clearly unknown root identifier. |
| `ZEN-MARKUP-PARSE` | Malformed markup such as mismatched tags or unexpected EOF. |
| `ZEN-EVT-UNKNOWN` | Unknown DOM event name warning with typo suggestions. |
| `CSV001` | A layout or component tried to export `load`; use Component Server Values instead. |
| `CSV002` | A layout or component tried to export `guard`; route guards stay page/resource-owned. |
| `CSV003` | A layout or component tried to export `action`; route actions stay page/resource-owned. |
| `CSV010` | A scoped server owner is missing `lang="ts"` when TypeScript is required. |
| `CSV012` | Component Server Values were combined with `prerender = true`, which v1 does not support. |
| `CSV013` | A scoped component prop expression requires runtime evaluation; use static literal props. |

Malformed markup is reported as structured diagnostics instead of panic-style process output.

## Component Server Values Diagnostics

`CSV001` through `CSV013` are Scoped Server Data diagnostics for Component Server Values. The common teaching cases are:

- `CSV001`: `load(ctx)` belongs on routes, not layout/component owners.
- `CSV012`: scoped owner values require a server render and cannot be used with build-time prerender in v1.
- `CSV013`: scoped component props must be static literals; identifiers, member expressions, spreads, functions, and event handlers are rejected.

## Editor Diagnostics

The language server also surfaces compiler-backed DOM safety diagnostics such as `ZEN-DOM-QUERY`, `ZEN-DOM-LISTENER`, and `ZEN-DOM-WRAPPER`. See [Editor Integration](/docs/contracts/editor-integration) for the editor tooling contract.
