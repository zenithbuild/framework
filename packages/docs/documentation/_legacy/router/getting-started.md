---
title: Getting Started
description: Set up the Zenith Router in your project with zero configuration.
section: Router
order: 2
---

# Getting Started

The Zenith Router is **already included** in `@zenithbuild/core`. No additional packages to install, no configuration files to create—just start building.

## Prerequisites

- A Zenith project (created with `npx create-zenith-app`)
- `@zenithbuild/core` installed (included by default)

## Project Structure

The router uses **file-based routing**. Your `src/pages/` directory structure defines your routes:

```
my-zenith-app/
├── src/
│   ├── layouts/
│   │   └── DefaultLayout.zen    ← Layout with router outlet
│   ├── pages/
│   │   ├── index.zen            ← Route: /
│   │   ├── about.zen            ← Route: /about
│   │   ├── contact.zen          ← Route: /contact
│   │   └── blog/
│   │       ├── index.zen        ← Route: /blog
│   │       └── [slug].zen       ← Route: /blog/:slug (dynamic)
│   └── components/
│       └── ...
└── package.json
```

## Step 1: Create Your Layout

Every Zenith app needs a layout with a **router outlet**. This is where page content is rendered.

Create `src/layouts/DefaultLayout.zen`:

```html
<script>
  // Optional: Import components used across all pages
</script>

<style>
  .layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  
  .header {
    background: var(--color-primary);
    padding: 1rem 2rem;
  }
  
  .nav {
    display: flex;
    gap: 1.5rem;
  }
  
  .main {
    flex: 1;
    padding: 2rem;
  }
  
  .footer {
    padding: 1rem 2rem;
    background: var(--color-surface);
    text-align: center;
  }
</style>

<template>
  <div class="layout">
    <!-- Header with navigation -->
    <header class="header">
      <nav class="nav">
        <ZenLink to="/">Home</ZenLink>
        <ZenLink to="/about">About</ZenLink>
        <ZenLink to="/blog">Blog</ZenLink>
        <ZenLink to="/contact">Contact</ZenLink>
      </nav>
    </header>
    
    <!-- ROUTER OUTLET: Page content renders here -->
    <main id="zenith-outlet" class="main">
      <slot />
    </main>
    
    <!-- Footer -->
    <footer class="footer">
      <p>&copy; 2026 My App</p>
    </footer>
  </div>
</template>
```

> 💡 **Key Point**: The `id="zenith-outlet"` is required. This tells the router where to render page content.

## Step 2: Create Your Pages

Create pages in `src/pages/`. Each file becomes a route.

### Home Page (`src/pages/index.zen`)

```html
<template>
  <div class="home">
    <h1>Welcome to My App</h1>
    <p>This is the home page.</p>
    
    <ZenLink to="/about" class="cta-button">
      Learn More →
    </ZenLink>
  </div>
</template>

<style>
  .home {
    text-align: center;
    padding: 4rem 2rem;
  }
  
  .cta-button {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: var(--color-accent);
    color: white;
    border-radius: 0.5rem;
    text-decoration: none;
  }
</style>
```

### About Page (`src/pages/about.zen`)

```html
<template>
  <div class="about">
    <h1>About Us</h1>
    <p>We build amazing things with Zenith.</p>
    
    <ZenLink to="/">← Back Home</ZenLink>
  </div>
</template>
```

## Step 3: Run Your App

Start the development server:

```bash
bun run dev
# or
npm run dev
```

Open `http://localhost:3000` and click between pages. Notice:

✅ **No page reloads** - Navigation is instant  
✅ **URL updates** - Browser address bar reflects the route  
✅ **Back/Forward works** - Browser history is properly managed  

## Route Patterns

Zenith supports various route patterns:

| File Path | Route | Description |
|-----------|-------|-------------|
| `pages/index.zen` | `/` | Home page |
| `pages/about.zen` | `/about` | Static route |
| `pages/blog/index.zen` | `/blog` | Nested index |
| `pages/blog/[slug].zen` | `/blog/:slug` | Dynamic segment |
| `pages/docs/[...path].zen` | `/docs/*` | Catch-all route |
| `pages/users/[id]/posts.zen` | `/users/:id/posts` | Mixed static/dynamic |

### Dynamic Routes

Use brackets `[param]` for dynamic segments:

```
src/pages/
└── products/
    └── [id].zen    → /products/123, /products/abc, etc.
```

Access the parameter in your component:

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let productId = '';
  
  zenOnMount(() => {
    const route = window.__zenith_router.getRoute();
    productId = route.params.id;
  });
</script>

<template>
  <h1>Product: {productId}</h1>
</template>
```

### Catch-All Routes

Use `[...param]` for catch-all routes:

```
src/pages/
└── docs/
    └── [...path].zen    → /docs/getting-started, /docs/api/ref, etc.
```

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let docPath = '';
  
  zenOnMount(() => {
    const route = window.__zenith_router.getRoute();
    docPath = route.params.path; // "getting-started" or "api/ref"
  });
</script>
```

## Adding Navigation

Use `ZenLink` for all internal navigation:

```html
<!-- Basic link -->
<ZenLink to="/about">About</ZenLink>

<!-- With prefetching -->
<ZenLink to="/products" prefetch>Products</ZenLink>

<!-- Dynamic links -->
<template>
{#each products as product}
  <ZenLink to="/products/{product.id}">
    {product.name}
  </ZenLink>
{/each}
</template>
```

## Verification Checklist

After setup, verify everything works:

- [ ] Layout has `id="zenith-outlet"` on the main content area
- [ ] Pages are in `src/pages/` directory
- [ ] Navigation uses `<ZenLink>` instead of `<a>` for internal links
- [ ] Clicking links navigates without page reload
- [ ] Browser back/forward buttons work correctly

---

## Next Steps

- [ZenLink Component](/docs/router/zenlink) - Deep dive into navigation
- [Reactive State](/docs/router/reactive-state) - Access route info in components
- [Best Practices](/docs/router/best-practices) - Production-ready patterns
