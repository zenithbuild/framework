---
title: Best Practices
description: Production-ready patterns for the Zenith Router.
section: Router
order: 7
---

# Best Practices

Follow these guidelines to build maintainable, performant, and user-friendly applications with the Zenith Router.

---

## 1. Always Use ZenLink for Internal Navigation

**❌ Don't use plain anchor tags for internal links:**

```html
<!-- Bad: Causes full page reload -->
<a href="/about">About</a>
```

**✅ Do use ZenLink:**

```html
<!-- Good: SPA navigation -->
<ZenLink to="/about">About</ZenLink>
```

### Why?

- `<a>` triggers a full page reload, losing state and requiring re-initialization
- `<ZenLink>` uses the router for instant SPA transitions
- `<ZenLink>` supports prefetching, history management, and reactive updates

---

## 2. Enable Prefetching for High-Traffic Routes

**❌ Don't leave users waiting:**

```html
<!-- Navigation feels slow -->
<ZenLink to="/products">Products</ZenLink>
```

**✅ Do prefetch likely destinations:**

```html
<!-- Navigation is instant -->
<ZenLink to="/products" prefetch>Products</ZenLink>
```

### Prefetch Priority

```html
<!-- Primary navigation: always prefetch -->
<nav class="primary">
  <ZenLink to="/" prefetch>Home</ZenLink>
  <ZenLink to="/products" prefetch>Products</ZenLink>
  <ZenLink to="/pricing" prefetch>Pricing</ZenLink>
</nav>

<!-- Secondary/footer: prefetch selectively -->
<nav class="secondary">
  <ZenLink to="/about">About</ZenLink>
  <ZenLink to="/careers">Careers</ZenLink>
  <ZenLink to="/contact">Contact</ZenLink>
</nav>
```

---

## 3. Organize Routes by Feature

**❌ Don't create flat, disorganized structures:**

```
src/pages/
├── product-widget.zen
├── product-gadget.zen
├── product-tool.zen
├── blog-post-1.zen
├── blog-post-2.zen
└── settings-profile.zen
```

**✅ Do use nested directories:**

```
src/pages/
├── index.zen
├── products/
│   ├── index.zen           # /products
│   ├── [id].zen            # /products/:id
│   └── categories/
│       └── [category].zen  # /products/categories/:category
├── blog/
│   ├── index.zen           # /blog
│   └── [slug].zen          # /blog/:slug
└── settings/
    ├── index.zen           # /settings
    ├── profile.zen         # /settings/profile
    └── billing.zen         # /settings/billing
```

### Benefits

- Clear, discoverable structure
- Easier to maintain as app grows
- Natural URL hierarchy for users
- Better code organization

---

## 4. Use Dynamic Routes for Scalability

**❌ Don't create individual files for each item:**

```
src/pages/
├── product-1.zen
├── product-2.zen
├── product-3.zen
└── product-4.zen
```

**✅ Do use dynamic route parameters:**

```
src/pages/
└── products/
    └── [id].zen  # Handles all product pages
```

```html
<!-- src/pages/products/[id].zen -->
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let product = null;
  
  zenOnMount(async () => {
    const { params } = window.__zenith_router.getRoute();
    product = await fetchProduct(params.id);
  });
</script>

<template>
{#if product}
    <h1>{product.name}</h1>
    <p>{product.description}</p>
{/if}
</template>
```

---

## 5. Validate Route Parameters

**❌ Don't trust route parameters blindly:**

```javascript
zenOnMount(async () => {
  const { params } = window.__zenith_router.getRoute();
  // Dangerous: no validation
  const product = await fetch(`/api/products/${params.id}`);
});
```

**✅ Do validate before using:**

```javascript
zenOnMount(async () => {
  const { params } = window.__zenith_router.getRoute();
  
  // Validate format
  if (!params.id || !/^[a-z0-9-]+$/.test(params.id)) {
    window.__zenith_router.navigate('/404', { replace: true });
    return;
  }
  
  // Fetch with error handling
  try {
    const response = await fetch(`/api/products/${params.id}`);
    if (!response.ok) throw new Error('Not found');
    product = await response.json();
  } catch (error) {
    window.__zenith_router.navigate('/404', { replace: true });
  }
});
```

---

## 6. Clean Up Route Subscriptions

**❌ Don't forget to unsubscribe:**

```javascript
// Memory leak!
zenOnMount(() => {
  window.__zenith_router.onRouteChange((route) => {
    updateSomething(route);
  });
});
```

**✅ Do clean up subscriptions:**

```javascript
zenOnMount(() => {
  const unsubscribe = window.__zenith_router.onRouteChange((route) => {
    updateSomething(route);
  });
  
  // Clean up when component unmounts
  zenOnUnmount(unsubscribe);
});
```

---

## 7. Handle 404s Gracefully

**✅ Create a catch-all 404 page:**

```
src/pages/
├── index.zen
├── about.zen
└── [...404].zen  # Catches all unmatched routes
```

```html
<!-- src/pages/[...404].zen -->
<style>
  .not-found {
    text-align: center;
    padding: 4rem 2rem;
  }
  
  .error-code {
    font-size: 6rem;
    font-weight: bold;
    color: var(--text-muted);
    margin: 0;
  }
</style>

<template>
  <div class="not-found">
    <p class="error-code">404</p>
    <h1>Page Not Found</h1>
    <p>The page you're looking for doesn't exist or has been moved.</p>
    <ZenLink to="/" class="btn">← Back to Home</ZenLink>
  </div>
</template>
```

---

## 8. Use Replace for Authentication Flows

**❌ Don't push login page to history:**

```javascript
// After logout, back button returns to dashboard (confusing)
window.__zenith_router.navigate('/login');
```

**✅ Do replace authentication transitions:**

```javascript
// After logout, back button goes to previous public page
window.__zenith_router.navigate('/login', { replace: true });

// After login, back button doesn't return to login
window.__zenith_router.navigate('/dashboard', { replace: true });
```

---

## 9. Consistent Route Naming

**✅ Follow these conventions:**

| Good ✅ | Bad ❌ |
|---------|--------|
| `/products` | `/Products` |
| `/user-settings` | `/userSettings` |
| `/blog/post-title` | `/blog/Post_Title` |
| `/api/v1/users` | `/API/V1/Users` |

### Rules

- Use **lowercase** for all routes
- Use **hyphens** for multi-word paths
- Use **plural** for collections (`/products`, `/users`)
- Use **singular** for specific items (`/products/[id]`)

---

## 10. Lazy Load Heavy Pages

**✅ Consider code splitting for large pages:**

```javascript
// For pages with heavy dependencies
zenOnMount(async () => {
  // Only load chart library when needed
  const { Chart } = await import('chart.js');
  
  // Initialize charts
  const ctx = document.getElementById('analytics-chart');
  new Chart(ctx, { /* config */ });
});
```

---

## Quick Reference

| Practice | Why |
|----------|-----|
| Use `ZenLink` | SPA navigation, no reload |
| Enable `prefetch` | Instant navigation UX |
| Organize by feature | Maintainability |
| Use dynamic routes | Scalability |
| Validate params | Security |
| Clean up subscriptions | Prevent memory leaks |
| Create 404 page | User experience |
| Use `replace` for auth | Logical history |
| Consistent naming | Predictability |
| Lazy load heavy pages | Performance |

---

## Next Steps

- [Advanced Usage](/docs/router/advanced) - Complex patterns
- [FAQ](/docs/router/faq) - Common questions
- [Examples](/docs/router/examples) - Full implementations
