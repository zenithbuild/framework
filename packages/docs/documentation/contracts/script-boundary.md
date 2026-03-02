---
title: "Script Boundary Contract"
description: "Authority boundaries for script emission and bootstrap behavior."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "bundler", "runtime", "scripts"]
---

# Script Boundary Contract

## ZEN-RULE-111: Only Bundler Emits Runtime Scripts

Contract: script injection authority belongs to bundler.

Banned:
- CLI/runtime/router script injection.
- Inline JS in emitted HTML.

Definition of Done:
- Emitted scripts are deterministic ESM assets.
- Runtime remains explicit bootstrap-only.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-bundler/SCRIPT_BOUNDARY_CONTRACT.md`.
