---
title: "ZenLink Reference"
description: "Canonical anchor-based opt-in surface for client navigation enhancement."
version: "0.4"
status: "canonical"
last_updated: "2026-03-12"
tags: ["reference", "navigation", "zenlink"]
---

# ZenLink Reference

## Contract: ZenLink Emits the Canonical Anchor Surface

Contract: `ZenLink` is a thin convenience wrapper over a semantic anchor marked with `data-zen-link`.

Invariant: `ZenLink` does not define a separate navigation contract. It exists to emit the same explicit opt-in surface as `a[data-zen-link]`.

Definition of Done:
- `ZenLink` renders a real `<a href="...">`.
- `ZenLink` applies `data-zen-link`.
- Unmarked anchors continue to hard navigate.

## Contract: What ZenLink Is Not

ZenLink is not:
- A button substitute
- A hidden routing API
- A guarantee that navigation will stay client-side

If the router cannot safely mirror server truth, Zenith falls back to browser navigation even for `ZenLink`.

## Site-Level Normalization

The Zenith site now routes link rendering through a canonical site wrapper at `site/src/components/ui/Links.zen`.

That wrapper does not replace the router contract. It classifies site hrefs and only emits the canonical soft-nav anchor contract for the currently proven route-entry set:
- `/`
- `/about`
- `/blog`
- `/docs`

The site wrapper keeps these surfaces on plain anchors for now:
- external links
- `mailto:` and `tel:` links
- same-page hash links
- cross-route deep-hash links such as `/docs#routing`
- internal routes outside the proven route-entry set
