---
title: Complete Examples
description: Full working examples using the Zenith Router.
section: Router
order: 10
---

# Complete Examples

Full working examples demonstrating the Zenith Router in real-world scenarios.

---

## Example 1: Blog with GSAP Animations

### Layout (`src/layouts/BlogLayout.zen`)

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  import { gsap } from 'gsap';
  
  let currentPath = '/';
  
  function isActive(path, exact = false) {
    return window.__zenith_router.isActive(path, exact);
  }
  
  zenOnMount(() => {
    currentPath = window.__zenith_router.getRoute().path;
    
    // Animate content on mount
    gsap.from('.page-content', {
      opacity: 0,
      y: 20,
      duration: 0.5,
      ease: 'power2.out'
    });
    
    const unsubscribe = window.__zenith_router.onRouteChange((route) => {
      currentPath = route.path;
      
      gsap.fromTo('.page-content',
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      );
    });
    
    zenOnUnmount(unsubscribe);
  });
</script>

<style>
  .layout { min-height: 100vh; display: flex; flex-direction: column; }
  .header { background: #1a1a2e; color: white; padding: 1rem 2rem; }
  .nav { display: flex; gap: 2rem; max-width: 1200px; margin: 0 auto; }
  .nav-link { color: rgba(255,255,255,0.7); text-decoration: none; padding: 0.5rem 0; }
  .nav-link:hover { color: white; }
  .nav-link.active { color: white; border-bottom: 2px solid #6366f1; }
  .page-content { flex: 1; max-width: 1200px; margin: 0 auto; padding: 2rem; width: 100%; }
  .footer { background: #f5f5f5; padding: 2rem; text-align: center; }
</style>

<template>
  <div class="layout">
    <header class="header">
      <nav class="nav">
        <ZenLink to="/" class="nav-link {isActive('/', true) ? 'active' : ''}" prefetch>
          Home
        </ZenLink>
        <ZenLink to="/blog" class="nav-link {isActive('/blog') ? 'active' : ''}" prefetch>
          Blog
        </ZenLink>
        <ZenLink to="/about" class="nav-link {isActive('/about', true) ? 'active' : ''}">
          About
        </ZenLink>
      </nav>
    </header>
    
    <main id="zenith-outlet" class="page-content">
      <slot />
    </main>
    
    <footer class="footer">
      <p>&copy; 2026 My Blog</p>
    </footer>
  </div>
</template>
```

### Blog Index (`src/pages/blog/index.zen`)

```html
<script>
  const posts = [
    { slug: 'getting-started', title: 'Getting Started with Zenith', date: '2026-01-15', excerpt: 'Learn the basics...' },
    { slug: 'advanced-routing', title: 'Advanced Routing Patterns', date: '2026-01-10', excerpt: 'Deep dive into...' },
    { slug: 'animations', title: 'Page Transitions with GSAP', date: '2026-01-05', excerpt: 'Create smooth...' }
  ];
</script>

<style>
  .blog-header { margin-bottom: 2rem; }
  .posts-grid { display: grid; gap: 1.5rem; }
  .post-card { padding: 1.5rem; background: #f8fafc; border-radius: 0.75rem; border: 1px solid #e2e8f0; }
  .post-title { margin: 0 0 0.5rem; font-size: 1.25rem; }
  .post-date { color: #64748b; font-size: 0.875rem; margin-bottom: 0.75rem; }
  .post-excerpt { color: #475569; margin-bottom: 1rem; }
  .read-more { color: #6366f1; text-decoration: none; font-weight: 500; }
  .read-more:hover { text-decoration: underline; }
</style>

<template>
  <div class="blog-index">
    <header class="blog-header">
      <h1>Blog</h1>
      <p>Thoughts on building modern web applications.</p>
    </header>
    
    <div class="posts-grid">
      {#each posts as post}
        <article class="post-card">
          <h2 class="post-title">{post.title}</h2>
          <p class="post-date">{post.date}</p>
          <p class="post-excerpt">{post.excerpt}</p>
          <ZenLink to="/blog/{post.slug}" class="read-more" prefetch>
            Read More →
          </ZenLink>
        </article>
      {/each}
    </div>
  </div>
</template>
```

### Blog Post (`src/pages/blog/[slug].zen`)

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let post = null;
  let loading = true;
  
  const postsData = {
    'getting-started': { title: 'Getting Started with Zenith', content: 'Full content here...' },
    'advanced-routing': { title: 'Advanced Routing Patterns', content: 'Full content here...' },
    'animations': { title: 'Page Transitions with GSAP', content: 'Full content here...' }
  };
  
  zenOnMount(() => {
    const { params } = window.__zenith_router.getRoute();
    const { slug } = params;
    
    // Simulate API fetch
    setTimeout(() => {
      post = postsData[slug];
      loading = false;
      
      if (!post) {
        window.__zenith_router.navigate('/404', { replace: true });
      }
    }, 200);
  });
</script>

<template>
  {#if loading}
    <p>Loading...</p>
  {:else if post}
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
      <ZenLink to="/blog">← Back to Blog</ZenLink>
    </article>
  {/if}
</template>
```

---

## Example 2: Dashboard with Protected Routes

### Auth Guard (`src/components/AuthGuard.zen`)

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let isAuthorized = false;
  let isChecking = true;
  
  zenOnMount(() => {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      window.__zenith_router.navigate(`/login?returnUrl=${returnUrl}`, { replace: true });
      return;
    }
    
    isAuthorized = true;
    isChecking = false;
  });
</script>

<template>
  {#if isChecking}
    <div>Checking authentication...</div>
  {:else if isAuthorized}
    <slot />
  {/if}
</template>
```

### Dashboard (`src/pages/dashboard/index.zen`)

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let currentPath = '/dashboard';
  
  function isActive(path) {
    return window.__zenith_router.isActive(path, true);
  }
  
  zenOnMount(() => {
    currentPath = window.__zenith_router.getRoute().path;
    const unsubscribe = window.__zenith_router.onRouteChange((route) => {
      currentPath = route.path;
    });
    zenOnUnmount(unsubscribe);
  });
  
  function logout() {
    localStorage.removeItem('auth_token');
    window.__zenith_router.navigate('/login', { replace: true });
  }
</script>

<style>
  .dashboard { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
  .sidebar { background: #1e293b; color: white; padding: 1.5rem; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 2rem; }
  .sidebar-link { color: rgba(255,255,255,0.7); padding: 0.75rem 1rem; border-radius: 0.5rem; text-decoration: none; }
  .sidebar-link:hover { background: rgba(255,255,255,0.1); }
  .sidebar-link.active { background: #6366f1; color: white; }
  .main { padding: 2rem; }
  .logout-btn { margin-top: 2rem; padding: 0.75rem 1rem; background: #ef4444; color: white; border: none; border-radius: 0.5rem; cursor: pointer; width: 100%; }
</style>

<template>
  <AuthGuard>
    <div class="dashboard">
      <aside class="sidebar">
        <h2>Dashboard</h2>
        <nav class="sidebar-nav">
          <ZenLink to="/dashboard" class="sidebar-link {isActive('/dashboard') ? 'active' : ''}">
            Overview
          </ZenLink>
          <ZenLink to="/dashboard/analytics" class="sidebar-link {isActive('/dashboard/analytics') ? 'active' : ''}">
            Analytics
          </ZenLink>
          <ZenLink to="/dashboard/settings" class="sidebar-link {isActive('/dashboard/settings') ? 'active' : ''}">
            Settings
          </ZenLink>
        </nav>
        <button class="logout-btn" on:click="logout">Logout</button>
      </aside>
      
      <main id="zenith-outlet" class="main">
        <h1>Welcome to Dashboard</h1>
        <p>Select a section from the sidebar.</p>
      </main>
    </div>
  </AuthGuard>
</template>
```

---

## Example 3: Product Filters with Query Params

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let filters = { category: '', sort: 'newest', page: 1 };
  let products = [];
  
  zenOnMount(() => {
    syncFilters();
    fetchProducts();
    
    const unsubscribe = window.__zenith_router.onRouteChange(() => {
      syncFilters();
      fetchProducts();
    });
    zenOnUnmount(unsubscribe);
  });
  
  function syncFilters() {
    const { query } = window.__zenith_router.getRoute();
    filters = {
      category: query.category || '',
      sort: query.sort || 'newest',
      page: parseInt(query.page) || 1
    };
  }
  
  function updateFilter(key, value) {
    const newFilters = { ...filters, [key]: value };
    if (key !== 'page') newFilters.page = 1;
    
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v && v !== '' && (k !== 'page' || v !== 1)) params.set(k, v);
    });
    
    window.__zenith_router.navigate(`/products${params.toString() ? '?' + params : ''}`);
  }
  
  async function fetchProducts() {
    const response = await fetch(`/api/products?${new URLSearchParams(filters)}`);
    products = await response.json();
  }

  function handleCategoryChange(e) {
    updateFilter('category', e.target.value);
  }

  function handleSortChange(e) {
    updateFilter('sort', e.target.value);
  }
</script>

<template>
  <div class="products-page">
    <aside class="filters">
      <select on:change="handleCategoryChange">
        <option value="">All Categories</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      
      <select on:change="handleSortChange">
        <option value="newest">Newest</option>
        <option value="price-asc">Price: Low to High</option>
        <option value="price-desc">Price: High to Low</option>
      </select>
    </aside>
    
    <div class="products-grid">
      {#each products as product}
        <ZenLink to="/products/{product.id}" class="product-card" prefetch>
          <h3>{product.name}</h3>
          <p>${product.price}</p>
        </ZenLink>
      {/each}
    </div>
  </div>
</template>
```

---

## Next Steps

- [Getting Started](/docs/router/getting-started) - Set up your first routes
- [API Reference](/docs/router/api) - Full API documentation
- [Best Practices](/docs/router/best-practices) - Production guidelines
