---
title: "Troubleshooting Guide"
description: "Diagnostics for blank routes, hydration failures, expression integrity, and route parity."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["guides", "troubleshooting", "hydration"]
---

# Troubleshooting Guide

## Contract: Blank Route Diagnosis

Contract: Route health requires non-empty SSR main content and successful client boot.

Invariant: Failures must surface as explicit diagnostics, not silent UI corruption.

Definition of Done:
- SSR HTML includes visible main content for route.
- Initial runtime boot does not abort with fatal errors.

Failure Modes:
- SSR emits empty main branch.
- Runtime crashes before bindings apply.

Evidence:
- SSR probes and console smoke tests pass for root, blog, docs, and unknown routes.

## Contract: Render Integrity

Contract: Expression rendering never leaks raw source text into user-visible output.

Invariant: Object collections are explicitly mapped to renderable nodes.

Definition of Done:
- No raw fragment symbols in visible text.
- No object-coercion text in rendered output.

Failure Modes:
- Raw expression source leaks into text nodes.
- Object collection coercion appears in UI.

Evidence:
- Regression tests assert absence of known leak patterns in rendered output.
