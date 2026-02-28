# ROUTER_CONTRACT.md — Sealed Navigation Interface

Canonical public docs: `../zenith-docs/documentation/contracts/router-contract.md`


> **This document is a legal boundary.**
> The router performs structural navigation.
> It does not interpret, evaluate, or rewrite page content.

## Status: FROZEN (V0)

---

## 1. Input Surface

The router consumes a **RouteManifest** — an ordered array of route definitions:

```ts
type RouteManifest = Array<{
  path: string
  load: (params?: Record<string, string>) => Promise<Module>
}>
```

| Input | Type | Contract |
|---|---|---|
| Route manifest | `RouteManifest` | Deterministic match order, first-match-wins |
| Container | `HTMLElement` | DOM target for `mount()` |
| Page modules | ESM module | Must satisfy `RUNTIME_CONTRACT.md` |

### Route Definition Format

```js
const routes = [
  { path: '/',            load: () => import('./pages/home.js') },
  { path: '/users/new',   load: () => import('./pages/user-new.js') },
  { path: '/users/:id',   load: ({ id }) => import('./pages/user.js') },
  { path: '/about',       load: () => import('./pages/about.js') }
];
```

**Rules:**
- Order is deterministic — **first match wins**
- **Route ordering is the developer's responsibility** — static routes must precede dynamic ones
- Exact segments match literally
- Param segments start with `:` (e.g. `:id`)
- No regex, no wildcards, no optional segments (V0)
- No query string parsing (V0)

### Param Naming Rules

- Param names must match the segment name exactly (`:id` extracts `id`)
- No nested param segments (e.g. `/users/:id/posts/:postId` is valid, `/users/:id:name` is not)
- No repeated param names within a single route path
- All extracted param values are **strings** — no type coercion

### RouteManifest Generation (Future)

In V0, the manifest is manually defined. In future versions:
- The **CLI** or **bundler** generates the manifest from the `/pages` directory
- The router consumes it blindly — **file-based routing logic never lives in the router**

---

## 2. Router Lifecycle

### Explicit Startup

The router does **not** auto-mount on creation. Startup is explicit:

```js
const router = createRouter({ routes, container });
router.start(); // Initial route match + mount happens here
```

**Why explicit:**
- Keeps router pure (no side effects on import)
- SSR/hydration future-compatible
- Testing is deterministic
- No invisible behavior

---

## 3. Navigation API (Allowed)

| Function | Signature | Behavior |
|---|---|---|
| `createRouter` | `({ routes, container }) => Router` | Create router instance |
| `Router.start` | `() => void` | Initial route match and mount |
| `navigate` | `(path: string) => void` | Push path to history, trigger route match |
| `back` | `() => void` | `history.back()` |
| `forward` | `() => void` | `history.forward()` |
| `onRouteChange` | `(callback) => () => void` | Subscribe, returns unsubscribe |
| `getCurrentPath` | `() => string` | Returns current pathname |
| `matchRoute` | `(routes, pathname) => result` | Pure match function (for testing) |

---

## 4. Router Prohibitions (Forbidden)

The router **must never**:

- Parse JavaScript expressions or AST
- Evaluate user code outside the module loader
- Modify or reorder bundler/runtime output
- Introduce component abstractions
- Perform virtual DOM diffing
- Introduce shadow state or hidden context
- Hijack `window` globals beyond `history` and `popstate`
- Implement implicit fallback routes
- Perform server-side module resolution
- Cast or coerce route parameters (all params are strings)
- Introduce lifecycle hooks beyond mount/unmount
- **Auto-scroll or manage scroll position**
- **Manage focus**
- **Auto-start on creation or import**

---

## 5. Matching Algorithm

Deterministic, single-pass:

1. Receive `pathname` string
2. Iterate routes array **in order**
3. For each route:
   - Split `route.path` and `pathname` by `/`
   - If segment counts differ → skip
   - Compare each segment:
     - If route segment starts with `:` → extract as param (string)
     - Otherwise → exact string comparison
   - If all segments match → return `{ route, params }`
4. If no route matches → return `null` (caller handles 404)

**No regex.** No globbing. No optional segments. No ambiguity.

---

## 6. Mount/Unmount Lifecycle

On navigation:

1. Match route from manifest
2. If no match → fire `onRouteChange({ path, matched: false })`
3. If matched:
   a. Call `cleanup()` from runtime (teardown previous page)
   b. Call `route.load(params)` → receive page module
   c. Call `mount(container, pageModule)` from runtime
   d. Fire `onRouteChange({ path, params, matched: true })`

**The router does not own mount/unmount.** It delegates to `@zenithbuild/runtime`.

---

## 7. History Integration

The router uses the History API:

- `history.pushState({}, '', path)` on `navigate()`
- `history.replaceState({}, '', path)` when appropriate
- Listens to `popstate` for back/forward
- No hash routing (V0)
- No scrollRestoration management (V0)

---

## 8. Public API Surface

Total exports (exhaustive):

```js
export { createRouter }   // Create router instance
export { navigate }       // Push navigation
export { back }           // History back
export { forward }        // History forward
export { onRouteChange }  // Subscribe to route changes
export { getCurrentPath } // Read current path
export { matchRoute }     // Pure match function (testing)
```

Seven functions. No more.

---

## 9. Alignment Verification

This contract is valid if and only if:

- [ ] Route matching is deterministic (first-match-wins, no ambiguity)
- [ ] All params are strings (no type coercion)
- [ ] No repeated param names in a single route
- [ ] Mount/unmount delegated to `@zenithbuild/runtime`
- [ ] No `eval`, `new Function`, or AST parsing
- [ ] No `window` globals beyond `history` and `popstate` listener
- [ ] No implicit fallback — unmatched routes return `null`
- [ ] No auto-start — `router.start()` is explicit
- [ ] No scroll or focus management
- [ ] Route manifest is consumed blindly — no file-system logic in router
