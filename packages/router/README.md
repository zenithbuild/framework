# @zenith/router

> Internal Zenith package. The generated router runtime is the authoritative surface here, not a general SPA framework API.

## Canonical Docs

- [Routing Contract](../../docs/documentation/contracts/routing.md)
- [Navigation Contract](../../docs/documentation/contracts/navigation.md)
- [Router Contract](../../docs/documentation/contracts/router-contract.md)
- [Navigation Lifecycle Contract](../../docs/documentation/contracts/navigation-lifecycle.md)

## Phase 2 Runtime Summary

- Plain anchors hard navigate by default.
- Soft navigation is opt-in only through `a[data-zen-link]`.
- `ZenLink` is a thin anchor wrapper over the same marker contract.
- Soft navigation fetches fresh same-origin HTML before committing history.
- Redirects, denies, unmatched routes, non-HTML responses, and runtime failures fall back to browser navigation.
- Client routing mirrors server route precedence and pathname-based identity.
- Phase 2 adds awaited lifecycle barriers at `navigation:before-leave`, `navigation:before-swap`, and `navigation:before-enter`.
