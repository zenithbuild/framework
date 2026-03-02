---
title: "Navigation Contract"
description: "Hard reload as default navigation policy and explicit opt-in soft navigation marker behavior."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["navigation", "routing", "contracts"]
---

# Navigation Contract

## Contract: Default Navigation Behavior

Contract: Default anchor navigation remains browser-native hard reload.

Invariant: Client navigation enhancement is explicit and marker-based.

Banned:
- Implicit navigation interception for every anchor.
- Default history mutation behavior.

Definition of Done:
- `<a href>` works without runtime router hooks.
- Opt-in links are explicitly marked with `data-zen-link`.

Failure Modes:
- Links appear to work only when runtime scripts boot successfully.
- URL changes happen without full reload for unmarked links.

Evidence:
- Direct URL entry and hard refresh behave consistently across route types.

## Contract: Router Runtime Scope

Contract: Router runtime preserves deterministic route handling and does not own default browser navigation.

Invariant: Server route matching remains authoritative.

Definition of Done:
- Runtime does not replace server route matching.
- Route params parity holds between hard reload and initial server render.

Failure Modes:
- Client runtime route result diverges from server route result.
- Initial navigation fails due to runtime-only route assumptions.

Evidence:
- Dev/preview route parity tests pass for root, docs, blog, and unknown slugs.
