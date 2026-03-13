---
title: "Navigation Lifecycle Contract"
description: "Canonical Phase 2 navigation lifecycle: deterministic client-side orchestration points layered on top of server-authoritative routing truth."
version: "0.5"
status: "canonical"
last_updated: "2026-03-12"
tags: ["navigation", "routing", "lifecycle", "contracts"]
---

# Navigation Lifecycle Contract

## Contract Boundary

Contract: the navigation lifecycle describes the existing Phase 1 client-navigation pipeline. It does not create a second router, reinterpret route outcomes, or bypass server truth.

Non-negotiable rules:
- Hard navigation remains the default.
- Only `a[data-zen-link]` participates in soft navigation.
- Pathname selects route identity. Query affects server data. Hash is post-commit scroll behavior.
- Redirects, denies, 404s, non-HTML responses, and runtime failures remain server-authoritative outcomes.
- Lifecycle hooks do not cancel or rewrite those outcomes.

## Lifecycle Order

Successful client-managed navigation order:
1. `navigation:request`
2. `navigation:data-ready`
3. `zx-router-scroll` phase `before`
4. `navigation:before-leave`
5. `navigation:leave-complete`
6. `navigation:before-swap`
7. history commit (`pushState` for forward soft nav, `replaceState` bookkeeping for popstate)
8. DOM/module mount
9. `navigation:content-swapped`
10. `zx-router-scroll` phase `apply`
11. focus restoration
12. `navigation:before-enter`
13. `zx-router-scroll` phase `after`
14. `navigation:enter-complete`

Failure order:
- Any navigation that emitted `navigation:request` and later stops being client-managed emits `navigation:abort`.
- Unexpected runtime or hook errors emit `navigation:error`.
- `navigation:error` does not reinterpret redirect/deny/404 behavior; browser fallback still follows the Phase 1 contract.

## Hook Semantics

### `navigation:request`
- Fires when the router accepts an internal manifest-matched navigation attempt.
- Informational only.
- Synchronous; returned promises are ignored, but rejected promises still emit `navigation:error`.
- Guarantees: no fresh HTML has committed, no history write has happened, current DOM is unchanged.

### `navigation:data-ready`
- Fires after advisory route-check and after fresh same-origin HTML has been fetched, parsed, and accepted for commit.
- Informational only.
- Synchronous; returned promises are ignored, but rejected promises still emit `navigation:error`.
- Guarantees: the target route still matches the manifest, fetched HTML is parseable, fresh SSR payload is available, and the router has not yet left the current view.

### `navigation:before-leave`
- Fires after `navigation:data-ready` and after scroll control has been paused through `zx-router-scroll` phase `before`.
- Awaited barrier.
- Not cancelable.
- Async listeners run sequentially in registration order.
- Guarantees: current DOM is still active, no history write has happened, and the next document payload is ready.

### `navigation:leave-complete`
- Fires immediately after all `navigation:before-leave` listeners settle.
- Informational only.
- Synchronous.
- Guarantees: current DOM is still active and the next step is the final pre-swap barrier.

### `navigation:before-swap`
- Fires after `navigation:leave-complete` and before history commit or DOM swap.
- Awaited barrier.
- Not cancelable.
- Async listeners run sequentially in registration order.
- Guarantees: fresh HTML is ready, current DOM is intact, and no client-side commit has happened yet.

### `navigation:content-swapped`
- Fires immediately after the target route module mounts successfully.
- Informational only.
- Synchronous.
- Guarantees: DOM ownership has moved to the new route and route HTML/SSR data are now the active page state, but post-commit scroll/focus have not run yet.

### `navigation:before-enter`
- Fires after `navigation:content-swapped`, after scroll positioning, and after focus restoration, while smooth scroll is still paused.
- Awaited barrier.
- Not cancelable.
- Async listeners run sequentially in registration order.
- Guarantees: the new DOM is live, scroll/focus are final for this navigation, and `zx-router-scroll` phase `after` has not run yet.

### `navigation:enter-complete`
- Fires after `navigation:before-enter`, after `zx-router-scroll` phase `after`, and after one animation frame of stabilization.
- Informational only.
- Synchronous.
- Guarantees: history, DOM, scroll, focus, and scroll-controller resume are complete for this navigation.

### `navigation:abort`
- Fires when a navigation that already emitted `navigation:request` will no longer commit further client-side work.
- Informational only.
- Synchronous.
- Reasons include: `superseded`, `server-redirect`, `server-deny`, `http-status`, `non-html`, `document-parse`, and `runtime-failure`.
- Guarantees: this navigation will not perform any later lifecycle commit steps after the abort event.

### `navigation:error`
- Fires when the router encounters an unexpected runtime failure or when a lifecycle listener throws or rejects.
- Informational only.
- Synchronous.
- Guarantees: the error is observable without granting the hook authority over route outcomes.
- Listener errors use `reason: "listener-error"` and include `hook`.

## Payload Shape

All Phase 2 lifecycle hooks receive a payload with:
- `navigationId`
- `navigationType` (`"push"` or `"pop"`)
- `to`
- `from`
- `routeId`
- `params`
- `stage`

Additional fields by phase:
- `document` on `navigation:data-ready`, `navigation:before-leave`, `navigation:leave-complete`, `navigation:before-swap`, `navigation:content-swapped`, `navigation:before-enter`, `navigation:enter-complete`
- `scroll` on `navigation:before-enter` and `navigation:enter-complete`
- `reason`, `status`, `location`, `historyCommitted`, and/or `error` on `navigation:abort` and `navigation:error`

## Abortability and Latest-Wins

Contract: the newest accepted navigation wins.

Rules:
- Starting a new client-managed navigation aborts the previous in-flight route-check/document work when possible.
- If an older navigation resolves late, it must not commit history, DOM, scroll, focus, or enter completion.
- Awaited lifecycle hooks (`before-leave`, `before-swap`, `before-enter`) participate in the same latest-wins rule.

## Phase 3 Transition Shell Assumptions

Allowed:
- Visual orchestration layered on top of `before-leave`, `before-swap`, `content-swapped`, `before-enter`, and `enter-complete`
- Prototype-scoped soft navigation surfaces such as a dedicated transition rail
- Cleanup through `navigation:abort` and `navigation:error`
- Route-entry rollout steps that explicitly exclude deeper hash-target variants until separately proven

Never allowed:
- Owning route truth
- Rewriting redirect, deny, 404, or error outcomes
- Mutating scroll policy outside the router and `zx-router-scroll`
- Broadening soft navigation beyond explicit opt-in links without a separate rollout decision

Example:
- `/docs` route-entry may participate in a prototype shell while `/docs#routing` still bypasses transition orchestration and remains a normal hash-target navigation.

## Banned

- Canceling navigation from lifecycle hooks.
- Rewriting redirect/deny/404 semantics in lifecycle handlers.
- Starting DOM swaps before `navigation:data-ready`.
- Resuming smooth scroll before the router’s `zx-router-scroll` phase `after`.
