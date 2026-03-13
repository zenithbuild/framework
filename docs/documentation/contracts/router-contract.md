---
title: "Router Contract"
description: "Phase 2 client router contract aligned to hardened server-routing truth and deterministic navigation lifecycle hooks."
version: "0.5"
status: "canonical"
last_updated: "2026-03-12"
tags: ["contracts", "router", "navigation"]
---

# Router Contract

## ZEN-RULE-109: Client Routing Mirrors Server Truth

Contract: client routing is an optimization layer over the hardened server-routing contract.

Invariant: the client router must mirror server route precedence, pathname-based route identity, params, and response semantics instead of inventing SPA-only behavior.

Required behaviors:
- Match route patterns with the same specificity rules as the server manifest.
- Treat pathname as route identity, query as data input, and hash as post-commit scroll behavior.
- Fetch fresh route HTML before committing a soft navigation.
- Hydrate the matched page with the fetched `__zenith_ssr_data`.
- Fall back to browser navigation for redirects, denies, unmatched routes, non-HTML responses, and runtime failures.

## Canonical Opt-In Surface

Soft navigation is explicit and anchor-only:
- `a[data-zen-link]` is the canonical marker contract.
- `<ZenLink>` is a convenience wrapper over that exact anchor contract.

Site-level wrappers may classify hrefs before emission, but they must still end in one of two outcomes:
- plain `<a>` with browser-native hard navigation
- `ZenLink` / `a[data-zen-link]` for explicit soft-nav opt-in

The router must not infer soft navigation from non-anchor elements.

## History and Abortability

Definition of Done:
- Successful forward soft navigation pushes exactly one history entry.
- Popstate handling never creates extra history entries.
- The latest navigation wins deterministically.
- In-flight route-check and document fetch requests are abortable or suppressible.
- A stale navigation may not commit DOM, data, scroll, or focus after a newer navigation starts.
- Awaited lifecycle hooks must obey the same latest-wins rule and may not commit after abort.

## Phase 2 Lifecycle

Phase 2 adds explicit lifecycle hooks over the hardened Phase 1 pipeline:
- `navigation:request`
- `navigation:before-leave`
- `navigation:leave-complete`
- `navigation:data-ready`
- `navigation:before-swap`
- `navigation:content-swapped`
- `navigation:before-enter`
- `navigation:enter-complete`
- `navigation:abort`
- `navigation:error`

Contract:
- These hooks describe the router's existing fetch-before-commit behavior.
- They do not create alternate route outcomes, cancel navigation, or relax server authority.
- Only `before-leave`, `before-swap`, and `before-enter` are awaited orchestration barriers.

Canonical semantics:
- [Navigation Contract](./navigation.md)
- [Navigation Lifecycle Contract](./navigation-lifecycle.md)

## Phase 3 Transition Orchestration

Phase 3 may add a transition shell on top of the lifecycle only when all of these remain true:
- the shell is visual-only
- the shell listens to lifecycle hooks instead of replacing them
- `before-leave`, `before-swap`, and `before-enter` stay the only awaited visual barriers
- `abort` and `error` always restore a clean shell state
- soft navigation stays explicit opt-in at the link surface
- rollout may whitelist route-entry paths without automatically whitelisting hash-deep variants of those paths

## Scope Boundaries

Still banned in Phase 2:
- Implicit interception of all anchors
- Stale server-data reuse
- Query-string SSR payload transport
- Treating route-check as security
- Visual transition systems that bypass the lifecycle contract

Canonical sources:
- [Routing Contract](./routing.md)
- [Navigation Contract](./navigation.md)
- [Navigation Lifecycle Contract](./navigation-lifecycle.md)
