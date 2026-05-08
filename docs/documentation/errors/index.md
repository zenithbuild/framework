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

Malformed markup is reported as structured diagnostics instead of panic-style process output.

## Editor Diagnostics

The language server also surfaces compiler-backed DOM safety diagnostics such as `ZEN-DOM-QUERY`, `ZEN-DOM-LISTENER`, and `ZEN-DOM-WRAPPER`. See [Editor Integration](/docs/contracts/editor-integration) for the editor tooling contract.
