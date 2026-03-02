---
title: "CLI Contract"
description: "Public CLI guarantees for command behavior, exit semantics, and build outputs."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "cli", "commands"]
---

# CLI Contract

## ZEN-RULE-113: CLI Is Orchestration, Not Framework Runtime

Contract: the CLI owns deterministic build/dev/preview orchestration only.

Invariant: CLI must not implement compiler semantics, runtime behavior, or hidden navigation logic.

## Command Guarantees

| Command | Guarantee |
| --- | --- |
| `zenith --version` | prints version and exits `0` before package checks |
| `zenith --help` | prints usage and exits `0` before package checks |
| `zenith dev` | starts development server and rebuild loop |
| `zenith build` | emits deterministic static build output |
| `zenith preview` | serves `dist/` without compilation |

## Output Contract

`zenith build` emits deterministic static artifacts under `dist/`, including page HTML and hashed assets.

Canonical source: `/Users/judahsullivan/Personal/zenith/zenith-cli/CLI_CONTRACT.md`.

See also:
- [HMR V1 Contract](/docs/contracts/hmr-v1-contract)
