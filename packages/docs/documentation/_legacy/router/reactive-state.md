---
title: Reactive Route State
description: Access and react to route changes in your Zenith components.
section: Router
order: 4
---

# Reactive Route State

The Zenith Router provides reactive access to the current route, including path, parameters, and query strings. This enables your components to respond to navigation changes in real-time.

## Accessing Current Route

Use `window.__zenith_router.getRoute()` to get the current route state:

```javascript
const route = window.__zenith_router.getRoute();

console.log(route.path);    // "/blog/hello-world"
console.log(route.params);  // { slug: "hello-world" }
console.log(route.query);   // { page: "1", sort: "asc" }
```

### Route Object Structure

```typescript
interface RouteState {
  path: string;              // Current URL path
  params: Record<string, string>;  // Dynamic route parameters
  query: Record<string, string>;   // Query string parameters
}
```

## Reading Route on Mount

Access route data when a component mounts:

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let productId = '';
  let productName = '';
  
  zenOnMount(() => {
    const route = window.__zenith_router.getRoute();
    productId = route.params.id;
    
    // Fetch product data based on route param
    fetchProduct(productId).then(product => {
      productName = product.name;
    });
  });
  
  async function fetchProduct(id) {
    const res = await fetch(`/api/products/${id}`);
    return res.json();
  }
</script>

<template>
  <div class="product-page">
    <h1>{productName || 'Loading...'}</h1>
    <p>Product ID: {productId}</p>
  </div>
</template>
```

## Listening to Route Changes

Subscribe to navigation events to update your UI when the route changes:

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let currentPath = '';
  let unsubscribe = null;
  
  zenOnMount(() => {
    // Get initial route
    currentPath = window.__zenith_router.getRoute().path;
    
    // Subscribe to changes
    unsubscribe = window.__zenith_router.onRouteChange((newRoute) => {
      currentPath = newRoute.path;
      console.log('Navigated to:', newRoute.path);
      
      // Perform side effects
      trackPageView(newRoute.path);
      updateDocumentTitle(newRoute);
    });
  });
  
  zenOnUnmount(() => {
    // Clean up subscription
    if (unsubscribe) {
      unsubscribe();
    }
  });
  
  function trackPageView(path) {
    // Analytics tracking
    if (window.gtag) {
      window.gtag('event', 'page_view', { page_path: path });
    }
  }
  
  function updateDocumentTitle(route) {
    const titles = {
      '/': 'Home | My App',
      '/about': 'About Us | My App',
      '/contact': 'Contact | My App'
    };
    document.title = titles[route.path] || 'My App';
  }
</script>

<template>
  <div class="route-display">
    <p>Current route: <code>{currentPath}</code></p>
  </div>
</template>
```

## Checking Active Routes

Determine if a route is currently active for styling navigation:

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let currentPath = '/';
  
  zenOnMount(() => {
    currentPath = window.__zenith_router.getRoute().path;
    
    const unsubscribe = window.__zenith_router.onRouteChange((route) => {
      currentPath = route.path;
    });
    
    zenOnUnmount(unsubscribe);
  });
  
  // Exact match
  function isExactActive(path) {
    return window.__zenith_router.isActive(path, true);
  }
  
  // Partial match (for nested routes)
  function isPartialActive(path) {
    return window.__zenith_router.isActive(path, false);
  }
</script>

<style>
  .nav-item { padding: 0.5rem 1rem; }
  .nav-item.active { background: var(--accent-bg); color: var(--accent); font-weight: 600; }
</style>

<template>
  <nav>
    <!-- Exact match for home -->
    <ZenLink to="/" class="nav-item {isExactActive('/') ? 'active' : ''}">
      Home
    </ZenLink>
    
    <!-- Partial match for blog section -->
    <ZenLink to="/blog" class="nav-item {isPartialActive('/blog') ? 'active' : ''}">
      Blog
    </ZenLink>
    
    <!-- This will be active for /blog, /blog/post-1, /blog/category/tech, etc. -->
  </nav>
</template>
```

### `isActive()` Comparison

```javascript
// Current route: /blog/post-1

window.__zenith_router.isActive('/blog', false);  // true (partial)
window.__zenith_router.isActive('/blog', true);   // false (exact)
window.__zenith_router.isActive('/blog/post-1', true);  // true (exact)
```

## Working with Query Parameters

Access and react to query string changes:

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let filters = {
    category: 'all',
    sort: 'newest',
    page: 1
  };
  
  let products = [];
  
  zenOnMount(() => {
    // Read initial query params
    updateFiltersFromRoute();
    
    // Watch for changes
    const unsubscribe = window.__zenith_router.onRouteChange(() => {
      updateFiltersFromRoute();
      fetchProducts();
    });
    
    zenOnUnmount(unsubscribe);
    
    // Initial fetch
    fetchProducts();
  });
  
  function updateFiltersFromRoute() {
    const { query } = window.__zenith_router.getRoute();
    filters = {
      category: query.category || 'all',
      sort: query.sort || 'newest',
      page: parseInt(query.page) || 1
    };
  }
  
  function setFilter(key, value) {
    const newFilters = { ...filters, [key]: value };
    const queryString = new URLSearchParams(newFilters).toString();
    window.__zenith_router.navigate(`/products?${queryString}`);
  }
  
  async function fetchProducts() {
    const response = await fetch(`/api/products?${new URLSearchParams(filters)}`);
    products = await response.json();
  }
</script>

<template>
  <div class="product-filters">
    <select onchange={(e) => setFilter('category', e.target.value)}>
      <option value="all" selected={filters.category === 'all'}>All</option>
      <option value="widgets" selected={filters.category === 'widgets'}>Widgets</option>
      <option value="gadgets" selected={filters.category === 'gadgets'}>Gadgets</option>
    </select>
    
    <select onchange={(e) => setFilter('sort', e.target.value)}>
      <option value="newest" selected={filters.sort === 'newest'}>Newest</option>
      <option value="popular" selected={filters.sort === 'popular'}>Popular</option>
      <option value="price" selected={filters.sort === 'price'}>Price</option>
    </select>
  </div>
  
  <div class="products">
{#each products as product}
      <div class="product-card">{product.name}</div>
{/each}
  </div>
</template>
```

## Dynamic Route Parameters

Handle dynamic segments like `/users/[id]/posts`:

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let userId = '';
  let user = null;
  let posts = [];
  
  zenOnMount(() => {
    loadData();
    
    // Re-load if route params change
    const unsubscribe = window.__zenith_router.onRouteChange((route) => {
      if (route.params.id !== userId) {
        loadData();
      }
    });
    
    zenOnUnmount(unsubscribe);
  });
  
  async function loadData() {
    const { params } = window.__zenith_router.getRoute();
    userId = params.id;
    
    // Parallel fetch
    const [userRes, postsRes] = await Promise.all([
      fetch(`/api/users/${userId}`),
      fetch(`/api/users/${userId}/posts`)
    ]);
    
    user = await userRes.json();
    posts = await postsRes.json();
  }
</script>

<template>
{#if user}
    <div class="user-profile">
      <h1>{user.name}'s Posts</h1>
      
      <ul class="posts-list">
{#each posts as post}
          <li>
            <ZenLink to="/users/{userId}/posts/{post.id}">
              {post.title}
            </ZenLink>
          </li>
{/each}
      </ul>
    </div>
{:else}
    <p>Loading...</p>
{/if}
</template>
```

## Creating a Route-Aware Component

Build a reusable component that reacts to route changes:

```html
<!-- src/components/RouteAware.zen -->
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  // Props
  const onRouteChange = null; // Callback prop
  
  let route = { path: '/', params: {}, query: {} };
  
  zenOnMount(() => {
    route = window.__zenith_router.getRoute();
    
    const unsubscribe = window.__zenith_router.onRouteChange((newRoute) => {
      route = newRoute;
      
      if (typeof onRouteChange === 'function') {
        onRouteChange(newRoute);
      }
    });
    
    zenOnUnmount(unsubscribe);
  });
</script>

<template>
  <slot route={route} />
</template>
```

Usage:

```html
<template>
<RouteAware>
{#slot route}
    <p>Current path: {route.path}</p>
{/slot}
</RouteAware>
</template>
```

---

## Best Practices

### ✅ Always Clean Up Subscriptions

```javascript
zenOnMount(() => {
  const unsubscribe = window.__zenith_router.onRouteChange(callback);
  
  zenOnUnmount(() => {
    unsubscribe(); // Prevent memory leaks
  });
});
```

### ✅ Debounce Heavy Operations

```javascript
let debounceTimeout;

window.__zenith_router.onRouteChange((route) => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    performExpensiveOperation(route);
  }, 100);
});
```

### ✅ Handle Missing Parameters

```javascript
zenOnMount(() => {
  const { params } = window.__zenith_router.getRoute();
  
  if (!params.id) {
    window.__zenith_router.navigate('/404', { replace: true });
    return;
  }
  
  loadData(params.id);
});
```

---

## Next Steps

- [Prefetching](/docs/router/prefetching) - Optimize navigation performance
- [Router API](/docs/router/api) - Complete API reference
- [Advanced Usage](/docs/router/advanced) - Complex patterns
