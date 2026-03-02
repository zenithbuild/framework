---
title: Advanced Usage
description: Complex routing patterns for sophisticated applications.
section: Router
order: 8
---

# Advanced Usage

This guide covers advanced routing patterns for sophisticated applications, including nested layouts, animations, route guards, and more.

---

## Nested Layouts

Create different layouts for different sections of your app.

### Structure

```
src/
├── layouts/
│   ├── DefaultLayout.zen      # Marketing pages
│   ├── DashboardLayout.zen    # Dashboard pages
│   └── DocsLayout.zen         # Documentation pages
└── pages/
    ├── index.zen              # Uses DefaultLayout
    ├── about.zen              # Uses DefaultLayout
    ├── dashboard/
    │   ├── index.zen          # Uses DashboardLayout
    │   ├── analytics.zen      # Uses DashboardLayout
    │   └── settings.zen       # Uses DashboardLayout
    └── docs/
        ├── index.zen          # Uses DocsLayout
        └── [...path].zen      # Uses DocsLayout
```

### Dashboard Layout Example

```html
<!-- src/layouts/DashboardLayout.zen -->
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let currentPath = '';
  
  zenOnMount(() => {
    currentPath = window.__zenith_router.getRoute().path;
    
    const unsubscribe = window.__zenith_router.onRouteChange((route) => {
      currentPath = route.path;
    });
    
    zenOnUnmount(unsubscribe);
  });
  
  function isActive(path) {
    return currentPath === path;
  }
</script>

<style>
  .dashboard {
    display: grid;
    grid-template-columns: 250px 1fr;
    min-height: 100vh;
  }
  
  .sidebar {
    background: var(--sidebar-bg);
    padding: 1.5rem;
    border-right: 1px solid var(--border);
  }
  
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .sidebar-link {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    color: var(--text-secondary);
    text-decoration: none;
    transition: all 0.2s;
  }
  
  .sidebar-link:hover {
    background: var(--hover-bg);
  }
  
  .sidebar-link.active {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
  }
  
  .main-content {
    padding: 2rem;
  }
</style>

<template>
  <div class="dashboard">
    <aside class="sidebar">
      <h2>Dashboard</h2>
      <nav class="sidebar-nav">
        <ZenLink 
          to="/dashboard" 
          class="sidebar-link {isActive('/dashboard') ? 'active' : ''}"
        >
          📊 Overview
        </ZenLink>
        <ZenLink 
          to="/dashboard/analytics" 
          class="sidebar-link {isActive('/dashboard/analytics') ? 'active' : ''}"
        >
          📈 Analytics
        </ZenLink>
        <ZenLink 
          to="/dashboard/settings" 
          class="sidebar-link {isActive('/dashboard/settings') ? 'active' : ''}"
        >
          ⚙️ Settings
        </ZenLink>
      </nav>
    </aside>
    
    <main id="zenith-outlet" class="main-content">
      <slot />
    </main>
  </div>
</template>
```

---

## Page Transitions with GSAP

Create smooth animated transitions between routes.

### Basic Fade Transition

```html
<!-- src/layouts/AnimatedLayout.zen -->
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  import { gsap } from 'gsap';
  
  zenOnMount(() => {
    // Animate in on mount
    gsap.from('.page-content', {
      opacity: 0,
      y: 20,
      duration: 0.5,
      ease: 'power2.out'
    });
    
    // Animate out before navigation
    const unsubscribe = window.__zenith_router.onRouteChange(() => {
      gsap.to('.page-content', {
        opacity: 0,
        y: -10,
        duration: 0.3,
        ease: 'power2.in'
      });
    });
    
    zenOnUnmount(unsubscribe);
  });
</script>

<template>
  <div class="page-content">
    <slot />
  </div>
</template>
```

### Slide Transitions

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  import { gsap } from 'gsap';
  
  let previousPath = '';
  
  zenOnMount(() => {
    previousPath = window.__zenith_router.getRoute().path;
    
    // Initial animation
    animateIn('right');
    
    const unsubscribe = window.__zenith_router.onRouteChange((route) => {
      // Determine direction based on route hierarchy
      const direction = route.path > previousPath ? 'left' : 'right';
      animateIn(direction);
      previousPath = route.path;
    });
    
    zenOnUnmount(unsubscribe);
  });
  
  function animateIn(direction) {
    const xFrom = direction === 'left' ? 50 : -50;
    
    gsap.fromTo('.page-content',
      { opacity: 0, x: xFrom },
      { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' }
    );
  }
</script>
```

### Staggered Content Animation

```html
<script>
  import { zenOnMount } from '@zenithbuild/core';
  import { gsap } from 'gsap';
  
  zenOnMount(() => {
    // Stagger animate all sections
    gsap.from('.animate-section', {
      opacity: 0,
      y: 30,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power2.out'
    });
  });
</script>

<template>
  <div class="page">
    <header class="animate-section">
      <h1>Welcome</h1>
    </header>
    
    <section class="animate-section">
      <h2>Features</h2>
      <p>Amazing features...</p>
    </section>
    
    <section class="animate-section">
      <h2>Pricing</h2>
      <p>Affordable plans...</p>
    </section>
  </div>
</template>
```

---

## Protected Routes

Implement authentication guards for protected pages.

### Basic Route Protection

```html
<!-- src/pages/dashboard/index.zen -->
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  let isLoading = true;
  let user = null;
  
  zenOnMount(() => {
    checkAuthentication();
  });
  
  async function checkAuthentication() {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      // Redirect to login, remember where user wanted to go
      const returnUrl = encodeURIComponent(window.location.pathname);
      window.__zenith_router.navigate(`/login?returnUrl=${returnUrl}`, { replace: true });
      return;
    }
    
    try {
      // Verify token with API
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Invalid token');
      
      user = await response.json();
      isLoading = false;
    } catch (error) {
      localStorage.removeItem('auth_token');
      window.__zenith_router.navigate('/login', { replace: true });
    }
  }
</script>

<template>
{#if isLoading}
    <div class="loading">
      <p>Verifying authentication...</p>
    </div>
{:else}
    <div class="dashboard">
      <h1>Welcome, {user.name}!</h1>
      <!-- Dashboard content -->
    </div>
{/if}
</template>
```

### Reusable Auth Guard Component

```html
<!-- src/components/AuthGuard.zen -->
<script>
  import { zenOnMount } from '@zenithbuild/core';
  
  // Props
  const redirectTo = '/login';
  const requireRole = null;  // Optional role requirement
  
  let isAuthorized = false;
  let isChecking = true;
  
  zenOnMount(async () => {
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      redirect();
      return;
    }
    
    try {
      const user = await verifyToken(token);
      
      // Check role if required
      if (requireRole && user.role !== requireRole) {
        redirect('/unauthorized');
        return;
      }
      
      isAuthorized = true;
    } catch (error) {
      redirect();
    } finally {
      isChecking = false;
    }
  });
  
  function redirect(path = redirectTo) {
    const returnUrl = encodeURIComponent(window.location.pathname);
    window.__zenith_router.navigate(`${path}?returnUrl=${returnUrl}`, { replace: true });
  }
  
  async function verifyToken(token) {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Invalid');
    return response.json();
  }
</script>

<template>
{#if isChecking}
    <div class="auth-checking">Loading...</div>
{:else if isAuthorized}
    <slot />
{/if}
</template>
```

Usage:

```html
<!-- src/pages/admin/index.zen -->
<template>
  <AuthGuard requireRole="admin" redirectTo="/login">
    <div class="admin-panel">
      <h1>Admin Panel</h1>
      <!-- Admin content -->
    </div>
  </AuthGuard>
</template>
```

---

## Query Parameter Management

Build complex filtering and pagination with query parameters.

### Filter Component

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let filters = {
    category: '',
    minPrice: '',
    maxPrice: '',
    sort: 'newest',
    page: 1
  };
  
  zenOnMount(() => {
    syncFiltersFromUrl();
    
    const unsubscribe = window.__zenith_router.onRouteChange(() => {
      syncFiltersFromUrl();
    });
    
    zenOnUnmount(unsubscribe);
  });
  
  function syncFiltersFromUrl() {
    const { query } = window.__zenith_router.getRoute();
    filters = {
      category: query.category || '',
      minPrice: query.minPrice || '',
      maxPrice: query.maxPrice || '',
      sort: query.sort || 'newest',
      page: parseInt(query.page) || 1
    };
  }
  
  function updateFilter(key, value) {
    const newFilters = { ...filters, [key]: value };
    
    // Reset page when filters change
    if (key !== 'page') {
      newFilters.page = 1;
    }
    
    // Remove empty values
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v && v !== '' && (k !== 'page' || v !== 1)) {
        params.set(k, v);
      }
    });
    
    const queryString = params.toString();
    window.__zenith_router.navigate(`/products${queryString ? '?' + queryString : ''}`);
  }
  
  function clearFilters() {
    window.__zenith_router.navigate('/products');
  }
</script>

<template>
  <div class="filters">
    <select onchange={(e) => updateFilter('category', e.target.value)}>
      <option value="">All Categories</option>
      <option value="electronics" selected={filters.category === 'electronics'}>Electronics</option>
      <option value="clothing" selected={filters.category === 'clothing'}>Clothing</option>
      <option value="home" selected={filters.category === 'home'}>Home</option>
    </select>
    
    <input 
      type="number" 
      placeholder="Min Price"
      value={filters.minPrice}
      onchange={(e) => updateFilter('minPrice', e.target.value)}
    />
    
    <input 
      type="number" 
      placeholder="Max Price"
      value={filters.maxPrice}
      onchange={(e) => updateFilter('maxPrice', e.target.value)}
    />
    
    <select onchange={(e) => updateFilter('sort', e.target.value)}>
      <option value="newest" selected={filters.sort === 'newest'}>Newest</option>
      <option value="price-asc" selected={filters.sort === 'price-asc'}>Price: Low to High</option>
      <option value="price-desc" selected={filters.sort === 'price-desc'}>Price: High to Low</option>
      <option value="popular" selected={filters.sort === 'popular'}>Popular</option>
    </select>
    
    <button onclick={clearFilters}>Clear Filters</button>
  </div>
</template>
```

### Pagination Component

```html
<script>
  // Props
  const totalPages = 10;
  const currentPage = 1;
  
  function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    
    const { query } = window.__zenith_router.getRoute();
    const params = new URLSearchParams(query);
    params.set('page', page);
    
    window.__zenith_router.navigate(`?${params.toString()}`);
  }
</script>

<style>
  .pagination { display: flex; gap: 0.5rem; }
  .page-btn { padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 0.25rem; }
  .page-btn.active { background: var(--accent); color: white; }
  .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

<template>
  <nav class="pagination">
    <button 
      class="page-btn" 
      onclick={() => goToPage(currentPage - 1)}
      disabled={currentPage === 1}
    >
      ← Prev
    </button>
    
{#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
      <button 
        class="page-btn {page === currentPage ? 'active' : ''}"
        onclick={() => goToPage(page)}
      >
        {page}
      </button>
{/each}
    
    <button 
      class="page-btn" 
      onclick={() => goToPage(currentPage + 1)}
      disabled={currentPage === totalPages}
    >
      Next →
    </button>
  </nav>
</template>
```

---

## Scroll Restoration

Handle scroll position on navigation.

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  const scrollPositions = new Map();
  
  zenOnMount(() => {
    // Save scroll position before navigation
    const saveScroll = () => {
      const path = window.location.pathname;
      scrollPositions.set(path, window.scrollY);
    };
    
    // Restore scroll position after navigation
    const restoreScroll = () => {
      const path = window.location.pathname;
      const savedPosition = scrollPositions.get(path);
      
      if (savedPosition) {
        requestAnimationFrame(() => {
          window.scrollTo(0, savedPosition);
        });
      } else {
        // New page: scroll to top
        window.scrollTo(0, 0);
      }
    };
    
    // Listen to route changes
    const unsubscribe = window.__zenith_router.onRouteChange(() => {
      saveScroll();
      requestAnimationFrame(restoreScroll);
    });
    
    // Handle browser back/forward
    window.addEventListener('popstate', restoreScroll);
    
    zenOnUnmount(() => {
      unsubscribe();
      window.removeEventListener('popstate', restoreScroll);
    });
  });
</script>
```

---

## Breadcrumb Generation

Automatically generate breadcrumbs from route path.

```html
<script>
  import { zenOnMount, zenOnUnmount } from '@zenithbuild/core';
  
  let breadcrumbs = [];
  
  const routeLabels = {
    '': 'Home',
    'products': 'Products',
    'categories': 'Categories',
    'blog': 'Blog',
    'about': 'About'
  };
  
  zenOnMount(() => {
    generateBreadcrumbs();
    
    const unsubscribe = window.__zenith_router.onRouteChange(() => {
      generateBreadcrumbs();
    });
    
    zenOnUnmount(unsubscribe);
  });
  
  function generateBreadcrumbs() {
    const { path, params } = window.__zenith_router.getRoute();
    const segments = path.split('/').filter(Boolean);
    
    breadcrumbs = [{ path: '/', label: 'Home' }];
    
    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Check if this is a dynamic segment value
      const label = routeLabels[segment] || 
                   params[Object.keys(params).find(k => params[k] === segment)] ||
                   segment.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      breadcrumbs.push({
        path: currentPath,
        label,
        isLast: index === segments.length - 1
      });
    });
  }
</script>

<template>
  <nav class="breadcrumbs">
{#each breadcrumbs as crumb, index}
{#if crumb.isLast}
        <span class="current">{crumb.label}</span>
{:else}
        <ZenLink to="{crumb.path}">{crumb.label}</ZenLink>
        <span class="separator">/</span>
{/if}
{/each}
  </nav>
</template>
```

---

## Next Steps

- [FAQ](/docs/router/faq) - Common questions answered
- [Examples](/docs/router/examples) - Complete implementations
- [Best Practices](/docs/router/best-practices) - Production guidelines
