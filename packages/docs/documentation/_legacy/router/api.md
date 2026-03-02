---
title: Router API
description: Complete API reference for the Zenith Router.
section: Router
order: 6
---

# Router API Reference

The Zenith Router exposes a global API at `window.__zenith_router` with methods for navigation, route inspection, and event handling.

## API Overview

```javascript
window.__zenith_router = {
  navigate(path, options),    // Navigate to a route
  getRoute(),                 // Get current route state
  onRouteChange(callback),    // Subscribe to route changes
  isActive(path, exact),      // Check if route is active
  prefetch(path),             // Prefetch a route
  initRouter(manifest, modules, outlet)  // Initialize (internal)
};
```

---

## `navigate(path, options?)`

Programmatically navigate to a route.

### Signature

```typescript
function navigate(
  path: string,
  options?: {
    replace?: boolean;
  }
): void
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Target route path |
| `options.replace` | `boolean` | Replace history entry instead of push |

### Examples

```javascript
// Basic navigation
window.__zenith_router.navigate('/about');

// Navigate with query parameters
window.__zenith_router.navigate('/search?q=zenith&page=1');

// Replace current history entry (back button skips this page)
window.__zenith_router.navigate('/dashboard', { replace: true });

// Navigate to dynamic route
const productId = '123';
window.__zenith_router.navigate(`/products/${productId}`);

// Relative navigation (from /blog to /blog/new-post)
window.__zenith_router.navigate('new-post');
```

### Use Cases

#### After Form Submission

```javascript
async function handleSubmit(formData) {
  const response = await fetch('/api/submit', {
    method: 'POST',
    body: formData
  });
  
  if (response.ok) {
    // Redirect to success page
    window.__zenith_router.navigate('/thank-you');
  }
}
```

#### After Authentication

```javascript
async function handleLogin(credentials) {
  const user = await authenticate(credentials);
  
  if (user) {
    // Replace login page in history so back doesn't return here
    window.__zenith_router.navigate('/dashboard', { replace: true });
  }
}
```

#### Conditional Navigation

```javascript
function goToCheckout() {
  const cart = getCart();
  
  if (cart.items.length === 0) {
    window.__zenith_router.navigate('/cart');
  } else {
    window.__zenith_router.navigate('/checkout');
  }
}
```

---

## `getRoute()`

Get the current route state.

### Signature

```typescript
function getRoute(): {
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
}
```

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | Current URL path (e.g., `/blog/hello-world`) |
| `params` | `object` | Dynamic route parameters (e.g., `{ slug: 'hello-world' }`) |
| `query` | `object` | Query string parameters (e.g., `{ page: '1' }`) |

### Examples

```javascript
// Get current route
const route = window.__zenith_router.getRoute();

console.log(route.path);    // "/products/widget-123"
console.log(route.params);  // { id: "widget-123" }
console.log(route.query);   // { color: "blue", size: "large" }
```

### Use Cases

#### Access Route Parameters

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let productId = '';
  
  zenOnMount(() => {
    const { params } = window.__zenith_router.getRoute();
    productId = params.id;
    loadProduct(productId);
  });
  
  function loadProduct(id) {
    console.log('Loading product:', id);
  }
</script>
```

#### Build Dynamic URLs

```javascript
function shareCurrentPage() {
  const { path, query } = window.__zenith_router.getRoute();
  const queryString = new URLSearchParams(query).toString();
  const url = `${window.location.origin}${path}${queryString ? '?' + queryString : ''}`;
  navigator.clipboard.writeText(url);
}
```

#### Analytics Tracking

```javascript
function trackPageView() {
  const { path, params, query } = window.__zenith_router.getRoute();
  
  // Mock analytics
  const analytics = window.analytics || { page: () => {} };
  
  analytics.page({
    path,
    params,
    query,
    timestamp: Date.now()
  });
}
```

---

## `onRouteChange(callback)`

Subscribe to route change events.

### Signature

```typescript
function onRouteChange(
  callback: (route: {
    path: string;
    params: Record<string, string>;
    query: Record<string, string>;
  }) => void
): () => void  // Returns unsubscribe function
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `function` | Called when route changes |

### Return Value

Returns an **unsubscribe function**. Call it to stop receiving updates.

### Examples

```javascript
// Subscribe to route changes
const unsubscribe = window.__zenith_router.onRouteChange((route) => {
  console.log('New route:', route.path);
  console.log('Params:', route.params);
  console.log('Query:', route.query);
});

// Later: stop listening
unsubscribe();
```

### Use Cases

#### Analytics Integration

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  zenOnMount(() => {
    const unsubscribe = window.__zenith_router.onRouteChange((route) => {
      // Google Analytics
      if (window.gtag) {
        window.gtag('event', 'page_view', {
          page_path: route.path,
          page_title: document.title
        });
      }
      
      // Custom analytics
      const analytics = window.analytics || { track: () => {} };
      analytics.track('page_view', { path: route.path });
    });
    
    zenOnUnmount(unsubscribe);
  });
</script>
```

#### Dynamic Page Titles

```javascript
const pageTitles = {
  '/': 'Home',
  '/about': 'About Us',
  '/products': 'Products',
  '/contact': 'Contact'
};

window.__zenith_router.onRouteChange((route) => {
  const title = pageTitles[route.path] || 'My App';
  document.title = `${title} | My App`;
});
```

#### Loading States

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let isNavigating = false;
  
  zenOnMount(() => {
    const unsubscribe = window.__zenith_router.onRouteChange(() => {
      isNavigating = true;
      
      // Reset after content loads
      requestAnimationFrame(() => {
        isNavigating = false;
      });
    });
    
    zenOnUnmount(unsubscribe);
  });
</script>

<template>
  <div class="app {isNavigating ? 'loading' : ''}">
    <slot />
  </div>
</template>
```

---

## `isActive(path, exact?)`

Check if a route is currently active.

### Signature

```typescript
function isActive(
  path: string,
  exact?: boolean
): boolean
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string` | required | Path to check |
| `exact` | `boolean` | `false` | Require exact match |

### Return Value

`true` if the route is active, `false` otherwise.

### Examples

```javascript
// Current route: /blog/post-1

window.__zenith_router.isActive('/blog');        // true (partial match)
window.__zenith_router.isActive('/blog', false); // true (partial match)
window.__zenith_router.isActive('/blog', true);  // false (not exact)
window.__zenith_router.isActive('/blog/post-1', true);  // true (exact match)
window.__zenith_router.isActive('/about');       // false
```

### Comparison Table

| Current Path | Check Path | Exact | Result |
|--------------|------------|-------|--------|
| `/blog` | `/blog` | `false` | ✅ true |
| `/blog` | `/blog` | `true` | ✅ true |
| `/blog/post-1` | `/blog` | `false` | ✅ true |
| `/blog/post-1` | `/blog` | `true` | ❌ false |
| `/blog/post-1` | `/blog/post-1` | `true` | ✅ true |
| `/products` | `/blog` | `false` | ❌ false |

### Use Cases

#### Navigation Highlighting

```html
<script>
  function navClass(path, exact = false) {
    return window.__zenith_router.isActive(path, exact) ? 'nav-item active' : 'nav-item';
  }
</script>

<template>
  <nav>
    <ZenLink to="/" class="{navClass('/', true)}">Home</ZenLink>
    <ZenLink to="/blog" class="{navClass('/blog')}">Blog</ZenLink>
    <ZenLink to="/about" class="{navClass('/about', true)}">About</ZenLink>
  </nav>
</template>
```

#### Conditional Rendering

```html
<template>
  <aside class="sidebar">
{#if window.__zenith_router.isActive('/blog')}
      <BlogSidebar />
{:else if window.__zenith_router.isActive('/docs')}
      <DocsSidebar />
{:else}
      <DefaultSidebar />
{/if}
  </aside>
</template>
```

---

## `prefetch(path)`

Prefetch a route for faster subsequent navigation.

### Signature

```typescript
function prefetch(path: string): Promise<void>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Route path to prefetch |

### Return Value

A `Promise` that resolves when prefetching is complete.

### Examples

```javascript
// Prefetch a single route
await window.__zenith_router.prefetch('/about');

// Prefetch multiple routes
const routes = ['/products', '/pricing', '/docs'];
await Promise.all(routes.map(r => window.__zenith_router.prefetch(r)));

// Prefetch with error handling
try {
  await window.__zenith_router.prefetch('/heavy-page');
  console.log('Prefetch complete');
} catch (error) {
  console.warn('Prefetch failed:', error);
}
```

### Use Cases

See the [Prefetching Guide](/docs/router/prefetching) for detailed strategies.

---

## `initRouter(manifest, modules, outlet)`

Initialize the router with route data. **This is called internally by Zenith** during app startup.

> ⚠️ **Internal API**: You typically don't need to call this directly.

### Signature

```typescript
function initRouter(
  manifest: RouteDefinition[],
  modules: Record<string, PageModule>,
  outlet: string | HTMLElement
): void
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `manifest` | `array` | Route definitions from build |
| `modules` | `object` | Page module registry |
| `outlet` | `string | HTMLElement` | Router outlet selector or element |

---

## Global Convenience

For convenience, `navigate` is also available directly on `window`:

```javascript
// These are equivalent
window.__zenith_router.navigate('/about');
window.navigate('/about');
```

---

## TypeScript Definitions

```typescript
interface RouteState {
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
}

interface NavigateOptions {
  replace?: boolean;
}

interface ZenithRouter {
  navigate(path: string, options?: NavigateOptions): void;
  getRoute(): RouteState;
  onRouteChange(callback: (route: RouteState) => void): () => void;
  isActive(path: string, exact?: boolean): boolean;
  prefetch(path: string): Promise<void>;
  initRouter(manifest: any[], modules: Record<string, any>, outlet: string | HTMLElement): void;
}

declare global {
  interface Window {
    __zenith_router: ZenithRouter;
    navigate: ZenithRouter['navigate'];
  }
}
```

---

## Next Steps

- [Best Practices](/docs/router/best-practices) - Production patterns
- [Advanced Usage](/docs/router/advanced) - Complex scenarios
- [FAQ](/docs/router/faq) - Common questions
