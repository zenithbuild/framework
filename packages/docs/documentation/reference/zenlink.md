---
title: "ZenLink Reference"
description: "Opt-in link marker behavior for client navigation enhancements."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["reference", "navigation", "zenlink"]
---

# ZenLink Reference

## Contract: Marker Behavior

Contract: ZenLink behavior is opt-in via `data-zen-link` on standard anchor elements.

Invariant: Unmarked anchor elements preserve default browser navigation behavior.

Definition of Done:
- Plain anchors hard reload.
- Marked anchors may opt into client enhancement where supported.

Failure Modes:
- Runtime intercepts unmarked links.
- Link behavior depends on hidden router state.

Evidence:
- Route parity tests pass with direct URL entry and hard refresh.

## Contract: Usage

Contract: Use semantic anchor markup for links.

Invariant: Link destination remains explicit in `href`.

Definition of Done:
- Canonical examples show only standards-based link markup.
- Docs avoid non-contract link APIs.

Failure Modes:
- Link examples rely on framework-specific hidden behavior.
- Runtime API examples contradict hard-reload default policy.

Evidence:
- Canonical link examples are validated during docs drift checks.
