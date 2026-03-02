---
title: Prefetching
description: Optimize navigation performance with route prefetching.
section: Router
order: 5
---

# Prefetching

Prefetching allows you to load route data **before** the user navigates, resulting in instant page transitions. Zenith Router supports both automatic and manual prefetching.

## Why Prefetch?

Without prefetching:
```
User hovers → User clicks → Load route → Show page
                            ~~~~~~~~~~~~
                            200-500ms delay
```

With prefetching:
```
User hovers → Load route → User clicks → Show page (instant!)
              ~~~~~~~~~~~
              Happens in background
```

## Automatic Prefetching

The easiest way to prefetch is using the `prefetch` prop on `ZenLink`:

```html
<ZenLink to="/products" prefetch>
  View Products
</ZenLink>
```

When the user **hovers** over this link:
1. The route is fetched in the background
2. Data is cached
3. When clicked, navigation is **instant**

### Enable for High-Traffic Links

```html
<nav class="main-nav">
  <!-- High-traffic pages: enable prefetch -->
  <ZenLink to="/" prefetch>Home</ZenLink>
  <ZenLink to="/products" prefetch>Products</ZenLink>
  <ZenLink to="/pricing" prefetch>Pricing</ZenLink>
  
  <!-- Low-traffic pages: no prefetch (save bandwidth) -->
  <ZenLink to="/about">About</ZenLink>
  <ZenLink to="/careers">Careers</ZenLink>
</nav>
```

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│  1. User hovers over ZenLink with prefetch enabled      │
│                                                         │
│  2. Router calls prefetch(path)                         │
│                                                         │
│  3. Route module is loaded and cached                   │
│                                                         │
│  4. User clicks → instant navigation from cache         │
└─────────────────────────────────────────────────────────┘
```

## Manual Prefetching

For more control, use the router's `prefetch()` method directly:

```javascript
// Prefetch a single route
window.__zenith_router.prefetch('/about');

// Prefetch multiple routes
const routes = ['/products', '/pricing', '/docs'];
routes.forEach(route => window.__zenith_router.prefetch(route));
```

### Prefetch on Component Mount

Load likely destinations when a page loads:

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  zenOnMount(() => {
    // User is on the home page, likely to visit these next
    window.__zenith_router.prefetch('/products');
    window.__zenith_router.prefetch('/about');
  });
</script>
```

### Prefetch on Idle

Use the browser's idle time for prefetching:

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  zenOnMount(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        // Prefetch during idle time
        window.__zenith_router.prefetch('/docs');
        window.__zenith_router.prefetch('/examples');
      });
    } else {
      // Fallback: prefetch after a short delay
      setTimeout(() => {
        window.__zenith_router.prefetch('/docs');
      }, 2000);
    }
  });
</script>
```

### Prefetch on Scroll

Load routes as users scroll toward them:

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let prefetchedProducts = false;
  
  zenOnMount(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !prefetchedProducts) {
          window.__zenith_router.prefetch('/products');
          prefetchedProducts = true;
          observer.disconnect();
        }
      });
    });
    
    const productsSection = document.querySelector('#products-section');
    if (productsSection) {
      observer.observe(productsSection);
    }
    
    zenOnUnmount(() => observer.disconnect());
  });
</script>

<template>
  <section id="products-section">
    <h2>Featured Products</h2>
    <ZenLink to="/products">View All →</ZenLink>
  </section>
</template>
```

### Prefetch Based on User Intent

Detect likely navigation based on user behavior:

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  zenOnMount(() => {
    // User moved mouse — they're engaged, prefetch likely destinations
    document.addEventListener('mousemove', () => {
      window.__zenith_router.prefetch('/products');
    }, { once: true });
    
    // User is on pricing, likely to go to signup
    if (window.location.pathname === '/pricing') {
      window.__zenith_router.prefetch('/signup');
    }
    
    // User is on a product page, prefetch checkout
    if (window.location.pathname.startsWith('/products/')) {
      window.__zenith_router.prefetch('/cart');
      window.__zenith_router.prefetch('/checkout');
    }
  });
</script>
```

## Prefetching Strategies

### Strategy 1: Eager (High-Traffic Pages)

Prefetch all main navigation routes immediately:

```javascript
zenOnMount(() => {
  ['/', '/products', '/pricing', '/docs', '/about'].forEach(route => {
    window.__zenith_router.prefetch(route);
  });
});
```

**Best for**: Fast connections, important pages

### Strategy 2: On Hover (Balanced)

Use `prefetch` prop on ZenLink for balanced performance:

```html
<ZenLink to="/products" prefetch>Products</ZenLink>
```

**Best for**: Most use cases

### Strategy 3: On Idle (Conservative)

Prefetch only during browser idle time:

```javascript
requestIdleCallback(() => {
  window.__zenith_router.prefetch('/docs');
}, { timeout: 5000 });
```

**Best for**: Slow connections, large pages

### Strategy 4: Intersection-Based (Smart)

Prefetch routes as their links become visible:

```javascript
const prefetchObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const link = entry.target.getAttribute('href');
      if (link) window.__zenith_router.prefetch(link);
    }
  });
});

document.querySelectorAll('[data-prefetch-visible]').forEach(link => {
  prefetchObserver.observe(link);
});
```

**Best for**: Long pages with many links

## Performance Benefits

### Measured Impact

| Metric | Without Prefetch | With Prefetch |
|--------|-----------------|---------------|
| Time to Interactive | 200-500ms | <50ms |
| Perceived Performance | Noticeable delay | Instant |
| User Satisfaction | Good | Excellent |

### Resource Usage

Prefetching uses minimal resources:
- **Network**: Small initial request, cached for reuse
- **Memory**: Route data is lightweight
- **CPU**: Minimal processing

## When NOT to Prefetch

❌ **Low-traffic pages**: Don't waste bandwidth on rarely visited pages

❌ **Large data pages**: Pages loading heavy data should load on-demand

❌ **Authentication-gated pages**: Don't prefetch pages that require login

❌ **Mobile with slow connections**: Consider disabling for 2G/3G

```javascript
// Check connection before prefetching
if (navigator.connection && navigator.connection.saveData) {
  // User has data saver enabled, skip prefetching
} else if (navigator.connection?.effectiveType === '2g') {
  // Slow connection, skip prefetching
} else {
  window.__zenith_router.prefetch('/products');
}
```

## Debug Prefetching

Track prefetch activity in development:

```javascript
// Wrap prefetch to log activity
const originalPrefetch = window.__zenith_router.prefetch;
window.__zenith_router.prefetch = async (path) => {
  console.log(`[Prefetch] Loading: ${path}`);
  const start = performance.now();
  await originalPrefetch(path);
  console.log(`[Prefetch] Loaded: ${path} (${(performance.now() - start).toFixed(1)}ms)`);
};
```

---

## Best Practices

### ✅ Prioritize High-Traffic Routes

```javascript
// Prefetch in order of importance
await window.__zenith_router.prefetch('/products');  // Most visited
await window.__zenith_router.prefetch('/pricing');   // Second
await window.__zenith_router.prefetch('/docs');      // Third
```

### ✅ Use Hover Prefetch for Navigation

```html
<nav>
  <ZenLink to="/products" prefetch>Products</ZenLink>
  <ZenLink to="/pricing" prefetch>Pricing</ZenLink>
</nav>
```

### ✅ Respect User Preferences

```javascript
// Check if user prefers reduced data usage
const shouldPrefetch = !navigator.connection?.saveData;

if (shouldPrefetch) {
  window.__zenith_router.prefetch('/docs');
}
```

---

## Next Steps

- [Router API](/docs/router/api) - Complete API reference
- [Best Practices](/docs/router/best-practices) - Production patterns
- [Advanced Usage](/docs/router/advanced) - Complex scenarios
