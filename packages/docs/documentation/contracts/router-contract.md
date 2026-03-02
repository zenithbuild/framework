---
title: "Router Contract"
description: "Deterministic route matching and navigation boundaries."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["contracts", "router", "navigation"]
---

# Router Contract

## ZEN-RULE-109: Server-Correct Routing With Hard-Navigation Default

Contract: route matching is deterministic and server-correct across dev/preview/prod.

Invariant: plain anchors hard navigate by default; soft navigation is explicit opt-in.

Route-protection UX hooks (`setRouteProtectionPolicy`, `on`, `off`) are router-owned.
They are advisory client behavior only and must never be treated as a security boundary.

Banned:
- Implicit global link interception.
- Query-transport SSR channels.

Definition of Done:
- Pathname-to-route resolution is deterministic.
- Params parity holds across environments.

Canonical sources:
- `/Users/judahsullivan/Personal/zenith/zenith-router/ROUTER_CONTRACT.md`
- `/Users/judahsullivan/Personal/zenith/zenith-docs/documentation/contracts/routing.md`
