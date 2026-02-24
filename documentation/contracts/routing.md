---
title: "Routing Contract"
description: "Server routing always-on, manifest always-on, dev/preview parity, and strict navigation defaults."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["routing", "manifest", "contracts"]
---

# Routing Contract

## Contract: Route Resolution

Contract: Server route matching is always on in dev, preview, and production.

Invariant: Route selection is derived from the route manifest using request pathname.

Invariant: `ctx.params` reflects the matched route, including catch-all slugs joined with `/`.

Definition of Done:
- Route id and params are consistent between dev and preview.
- Catch-all and dynamic routes resolve deterministically.

Failure Modes:
- Route params differ by environment.
- Catch-all params are truncated.
- A request path maps to different route ids across environments.

Evidence:
- Route smoke tests pass for static, dynamic, and catch-all paths in dev and preview.

## Contract: Navigation Defaults

Contract: Default `<a href>` keeps browser hard navigation.

Invariant: Client-side soft navigation is opt-in only via `data-zen-link`.

Banned:
- Any default URL mutation via History APIs.
- Global link interception for all anchor tags.

Definition of Done:
- Standard links hard reload.
- Soft navigation behavior applies only when link is explicitly marked.

Failure Modes:
- Plain links mutate URL without reload.
- Route behavior depends on client-only hooks.

Evidence:
- Drift checks confirm no history mutation APIs in framework outputs.
