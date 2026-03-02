# @zenith/router

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.


File-based SPA router for Zenith framework with **deterministic, compile-time route resolution**.

## Canonical Docs

- Routing contract: `../zenith-docs/documentation/contracts/routing.md`
- Navigation contract: `../zenith-docs/documentation/contracts/navigation.md`
- Router contract: `../zenith-docs/documentation/contracts/router-contract.md`

## Features

- 📁 **File-based routing** — Pages in `pages/` directory become routes automatically
- ⚡ **Compile-time resolution** — Route manifest generated at build time, not runtime
- 🔗 **ZenLink component** — Declarative navigation with prefetching
- 🧭 **Programmatic navigation** — `navigate()`, `prefetch()`, `isActive()` APIs
- 🎯 **Type-safe** — Full TypeScript support with route parameter inference
- 🚀 **Hydration-safe** — No runtime hacks, works seamlessly with SSR/SSG

## Installation

```bash
bun add @zenith/router
```

## Usage

### Programmatic Navigation

```ts
import { navigate, prefetch, isActive, getRoute } from '@zenith/router'

// Navigate to a route
navigate('/about')

// Navigate with replace (no history entry)
navigate('/dashboard', { replace: true })

// Prefetch a route for faster navigation
prefetch('/blog')

// Check if a route is active
if (isActive('/blog')) {
  console.log('Currently on blog section')
}

// Get current route state
const { path, params, query } = getRoute()
```

### ZenLink Component (in .zen files)

```html
<ZenLink href="/about">About Us</ZenLink>

<!-- With prefetching on hover -->
<ZenLink href="/blog" preload>Blog</ZenLink>

<!-- External links automatically open in new tab -->
<ZenLink href="https://github.com">GitHub</ZenLink>
```

### Build-time Route Manifest

The router generates a route manifest at compile time:

```ts
import { generateRouteManifest, discoverPages } from '@zenith/router/manifest'

const pagesDir = './src/pages'
const manifest = generateRouteManifest(pagesDir)

// manifest contains:
// - path: Route pattern (e.g., /blog/:id)
// - regex: Compiled RegExp for matching
// - paramNames: Dynamic segment names
// - score: Priority for deterministic matching
```

## Route Patterns

| File Path | Route Pattern |
|-----------|---------------|
| `pages/index.zen` | `/` |
| `pages/about.zen` | `/about` |
| `pages/blog/index.zen` | `/blog` |
| `pages/blog/[id].zen` | `/blog/:id` |
| `pages/posts/[...slug].zen` | `/posts/*slug` |
| `pages/[[...all]].zen` | `/*all?` (optional) |

## Architecture

```
@zenith/router
├── src/
│   ├── index.ts          # Main exports
│   ├── types.ts          # Core types
│   ├── manifest.ts       # Build-time manifest generation
│   ├── runtime.ts        # Client-side SPA router
│   └── navigation/
│       ├── index.ts      # Navigation exports
│       ├── zen-link.ts   # Navigation API
│       └── ZenLink.zen   # Declarative component
```

## API Reference

### Navigation Functions

- `navigate(path, options?)` — Navigate to a path
- `prefetch(path)` — Prefetch a route for faster navigation
- `isActive(path, exact?)` — Check if path is currently active
- `getRoute()` — Get current route state
- `back()`, `forward()`, `go(delta)` — History navigation

### Manifest Generation

- `discoverPages(pagesDir)` — Find all .zen files in pages directory
- `generateRouteManifest(pagesDir)` — Generate complete route manifest
- `filePathToRoutePath(filePath, pagesDir)` — Convert file path to route
- `routePathToRegex(routePath)` — Compile route to RegExp

### Types

- `RouteState` — Current route state (path, params, query)
- `RouteRecord` — Compiled route definition
- `NavigateOptions` — Options for navigation
- `ZenLinkProps` — Props for ZenLink component

## License

MIT
# zenith-router
