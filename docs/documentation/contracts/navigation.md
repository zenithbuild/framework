---
title: "Navigation Contract"
description: "Phase 2 client-navigation contract: hard-navigation default, anchor-only opt-in soft nav, server-authoritative document fetch semantics, and deterministic lifecycle timing."
version: "0.5"
status: "canonical"
last_updated: "2026-03-12"
tags: ["navigation", "routing", "contracts"]
---

# Navigation Contract

## Contract: Hard Navigation Is Default

Contract: plain `<a href>` remains browser-native hard navigation.

Invariant: Zenith only enhances navigation when the link is a semantic anchor explicitly marked with `data-zen-link`.

Canonical opt-in surface:
- `a[data-zen-link]`
- `<ZenLink>` as a thin wrapper that emits the same anchor contract

Site normalization note:
- The Zenith site may route authored links through a local classifier component before they become anchors.
- That site wrapper must stay subordinate to this contract: it may choose between plain `<a>` and `ZenLink`, but it may not invent new soft-nav eligibility rules.

Non-contract surfaces:
- Buttons with `href`
- Buttons or other non-anchor elements carrying router markers

## Contract: Soft Navigation Commits Only After Fresh Server Truth

Contract: marked internal links may soft-navigate only after Zenith fetches fresh same-origin HTML for the target URL and verifies the response is safe to commit.

Invariant: route identity stays pathname-based. Query affects server data. Hash is post-swap scroll behavior.

Definition of Done:
- The router resolves the target route from the manifest using pathname only.
- The router fetches the target document before `pushState`.
- The router hydrates with fresh `window.__zenith_ssr_data` from the fetched response.
- Redirects, denies, non-HTML responses, unmatched routes, and fetch failures fall back to browser navigation.

Banned:
- Reusing stale SSR payloads across soft navigations.
- Encoding SSR payloads in query params.
- Treating client routing as a security boundary.

Lifecycle note:
- Once a target has passed manifest match, advisory route-check, and fresh document validation, Zenith exposes the Phase 2 navigation lifecycle.
- Those hooks describe the existing commit pipeline; they do not invent alternate route outcomes.
- Canonical semantics live in [Navigation Lifecycle Contract](./navigation-lifecycle.md).

## Contract: History, Scroll, Focus, and Hash

Contract: once a soft navigation is allowed to commit, the router owns History API writes and deterministic post-commit scroll/focus behavior.

Rules:
- Successful forward soft navigation uses `history.pushState(...)`.
- Initial entry seeding and popstate bookkeeping use `history.replaceState(...)`.
- Browser back/forward uses `popstate`; the router never fabricates extra entries for it.
- Hash-only same-document links are not intercepted.
- Forward soft navigation scrolls to top unless a hash target exists.
- Popstate restores saved scroll unless a hash target exists.
- Focus moves to the hash target when present, otherwise to `<main>` or `#app` when available.
- `navigation:content-swapped` fires before post-commit scroll/focus are applied.
- `navigation:before-enter` fires after scroll/focus resolution but before smooth-scroll resume.
- `navigation:enter-complete` fires after the scroll controller resume point and one animation frame of stabilization.

## Contract: Lenis Coordination

Contract: the router and any smooth-scroll controller must coordinate through the internal `zx-router-scroll` document event so there is only one scroll writer.

Phases:
- `before`: pause smooth scrolling before DOM swap
- `apply`: optionally claim the scroll write for top/restore/hash positioning
- `after`: refresh and resume smooth scrolling after the DOM is stable

Phase 2 timing:
- `before` runs after `navigation:data-ready` and before `navigation:before-leave`.
- `apply` runs after `navigation:content-swapped` and before `navigation:before-enter`.
- `after` runs after `navigation:before-enter` and before `navigation:enter-complete`.

Phase boundary:
- `zx-router-scroll` remains the internal scroll-coordination primitive.
- Transition orchestration must layer on top of the navigation lifecycle instead of replacing it.
- The first valid rollout shape is a narrow, route-whitelisted prototype shell rather than a site-wide interception sweep.

## Controlled Rollout Notes

Current Phase 3 rollout shape:
- Explicit prototype links are limited to route-entry anchors for a small whitelist.
- Route-entry means the pathname-only document entry such as `/docs`.
- Deep-hash links such as `/docs#routing` remain outside the prototype set until they are separately hardened.
- The site-level `Links.zen` wrapper mirrors that boundary by emitting `ZenLink` only for the proven route-entry set and leaving deep-hash links on plain anchors.

Why:
- Route identity remains pathname-based, but prototype transition scope is narrower than route identity during rollout.
- Hash-bearing docs links still need their own scroll, focus, and content-readiness smoke coverage before they can opt into visual orchestration.
