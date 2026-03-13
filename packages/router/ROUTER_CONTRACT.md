# ROUTER_CONTRACT.md

Internal mirror of the canonical routing docs:

- [Routing Contract](../../docs/documentation/contracts/routing.md)
- [Navigation Contract](../../docs/documentation/contracts/navigation.md)
- [Router Contract](../../docs/documentation/contracts/router-contract.md)
- [Navigation Lifecycle Contract](../../docs/documentation/contracts/navigation-lifecycle.md)

## Phase 2 Rules

- Server routing remains authority.
- `a[data-zen-link]` is the only canonical soft-nav surface.
- Soft navigation must fetch fresh same-origin HTML before `pushState`.
- Pathname selects the route. Query affects data. Hash is post-commit scroll behavior.
- Redirects, denies, unmatched routes, non-HTML responses, and runtime failures fall back to browser navigation.
- The router owns history writes, scroll restoration, and focus only after a successful soft-nav commit.
- `zx-router-scroll` is the internal router-to-scroll-controller coordination event.
- `navigation:before-leave`, `navigation:before-swap`, and `navigation:before-enter` are awaited lifecycle barriers.
