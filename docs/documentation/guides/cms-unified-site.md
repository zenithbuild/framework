---
title: "CMS Unified Site Guide"
description: "Render blog/docs/not-found views from one route model using explicit mapping and schema-based links."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["guides", "cms", "site"]
---

# CMS Unified Site Guide

## Contract: Unified View Model

Contract: Catch-all route model includes explicit `view` discriminator and route-safe data payload.

Invariant: Rendering logic always chooses a deterministic visible branch.

Definition of Done:
- `/blog` and `/docs` render visible content sections.
- Unknown slugs render not-found content.

Failure Modes:
- Branch resolution returns no visible content.
- Missing model fields cause client boot failure.

Evidence:
- SSR checks verify non-empty main content on blog/docs/unknown routes.

## Contract: Link Source of Truth

Contract: Link URLs derive from schema fields (for example, slug/path fields in payload records).

Invariant: Link values are not guessed when schema-defined values exist.

Definition of Done:
- Blog links follow payload slug fields.
- Docs links follow payload path fields.

Failure Modes:
- Link URLs mismatch route schema.
- Unknown routes bypass not-found handling.

Evidence:
- Route tests assert rendered URLs match source payload fields.
