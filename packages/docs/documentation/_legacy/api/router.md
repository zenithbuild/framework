# @zenithbuild/router API Reference

The Zenith Router provides file-based routing and declarative navigation with zero runtime search overhead.

## Navigation API

### `navigate(to: string, options?: NavigateOptions)`
Performs a smooth SPA transition to a new path.
- **Contract Proof**: Does not use `history.pushState` directly; uses the `zenOrder` scheduling primitive to ensure consistency.

### `isActive(path: string): boolean`
Returns `true` if the current route matches the given path. Reactive.

### `prefetch(path: string)`
Pre-warms the cache for a given route without performing navigation.

## Manifest Generation

The router works by generating a **static route manifest** at build time.

### `generateRouteManifest(pagesDir: string): RouteManifest`
Scans a directory for `.zen` files and calculates a deterministic routing tree.

## Components

### `<ZenLink to="...">`
The preferred way to navigate.
- **Attributes**:
    - `to`: Target URL.
    - `class`: Styling.
    - `transition`: Optional transition name (symbolic).

## Route Parameters
Access parameters via the built-in `zenRoute` global or `getParam()` utility.
```ts
import { getParam } from '@zenithbuild/router';
const userId = getParam('id');
```
