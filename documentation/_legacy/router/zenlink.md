---
title: ZenLink Component
description: The declarative navigation component for SPA routing in Zenith.
section: Router
order: 3
---

# ZenLink Component

`<ZenLink>` is Zenith's primary navigation component. It provides SPA routing, intelligent prefetching, and accessibility—all with a simple, declarative API.

## Basic Usage

```html
<!-- Simple internal link -->
<ZenLink to="/about">About Us</ZenLink>

<!-- Link with styling -->
<ZenLink to="/contact" class="btn btn-primary">
  Get in Touch
</ZenLink>

<!-- Link with prefetching -->
<ZenLink to="/products" prefetch>
  View Products
</ZenLink>
```

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `to` | `string` | **required** | Target route path |
| `prefetch` | `boolean` | `false` | Prefetch route on hover |
| `replace` | `boolean` | `false` | Replace history entry instead of push |
| `class` | `string` | `""` | CSS classes |
| `id` | `string` | `""` | HTML id attribute |
| `target` | `string` | `""` | Link target (`_blank`, `_self`, etc.) |
| `rel` | `string` | `""` | Link relationship |
| `title` | `string` | `""` | Tooltip text |
| `onClick` | `function` | `undefined` | Custom click handler |

### `to` (required)

The destination path. Can be static or dynamic:

```html
<!-- Static path -->
<ZenLink to="/about">About</ZenLink>

<!-- Path with query params -->
<ZenLink to="/search?q=zenith">Search</ZenLink>

<!-- Dynamic path -->
<ZenLink to="/blog/{post.slug}">Read More</ZenLink>
```

### `prefetch`

When enabled, the route is prefetched when the user hovers over the link:

```html
<ZenLink to="/heavy-page" prefetch>
  This page loads instantly when clicked
</ZenLink>
```

> 💡 **Pro Tip**: Enable prefetch for your most-visited pages (products, docs, pricing).

### `replace`

Replace the current history entry instead of adding a new one:

```html
<!-- After login, replace the login page in history -->
<ZenLink to="/dashboard" replace>
  Go to Dashboard
</ZenLink>
```

This means pressing "Back" won't return to the previous page.

### `onClick`

Add custom click behavior:

```html
<script>
  function handleClick(event) {
    console.log('Link clicked!');
    // Return false to cancel navigation
    // return false;
  }
</script>

<ZenLink to="/checkout" onClick={handleClick}>
  Proceed to Checkout
</ZenLink>
```

---

## Link Behavior

### Internal vs External Links

ZenLink **automatically detects** link types and handles them appropriately:

```html
<!-- Internal: SPA navigation -->
<ZenLink to="/about">About</ZenLink>
<ZenLink to="/blog/post-1">Blog Post</ZenLink>

<!-- External: Opens in new tab -->
<ZenLink to="https://github.com">GitHub</ZenLink>
<ZenLink to="https://example.com/api">External API</ZenLink>

<!-- Special protocols: Native behavior -->
<ZenLink to="mailto:hello@zenith.dev">Email Us</ZenLink>
<ZenLink to="tel:+1234567890">Call Us</ZenLink>
```

External links automatically:
- Open in a new tab (`target="_blank"`)
- Include security attributes (`rel="noopener noreferrer"`)

### Modifier Key Support

ZenLink respects standard browser conventions:

| Action | Behavior |
|--------|----------|
| Normal click | SPA navigation |
| Ctrl/Cmd + Click | Open in new tab |
| Shift + Click | Open in new window |
| Alt + Click | Download (if applicable) |

### Prefetching on Hover

When `prefetch` is enabled:

```html
<ZenLink to="/docs" prefetch>Documentation</ZenLink>
```

Timeline:
1. User hovers over link
2. Route data is fetched in background
3. Data is cached
4. User clicks → **instant navigation**

---

## Practical Examples

### Navigation Menu

```html
<script>
  function isActive(path) {
    return window.__zenith_router.isActive(path, true);
  }
</script>

<style>
  .nav { display: flex; gap: 1rem; }
  .nav-link { 
    padding: 0.5rem 1rem; 
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }
  .nav-link:hover { background: var(--bg-hover); }
  .nav-link.active { 
    color: var(--text-primary); 
    background: var(--bg-active);
    font-weight: 600;
  }
</style>

<template>
  <nav class="nav">
    <ZenLink to="/" class="nav-link {isActive('/') ? 'active' : ''}">
      Home
    </ZenLink>
    <ZenLink to="/products" class="nav-link {isActive('/products') ? 'active' : ''}" prefetch>
      Products
    </ZenLink>
    <ZenLink to="/pricing" class="nav-link {isActive('/pricing') ? 'active' : ''}" prefetch>
      Pricing
    </ZenLink>
    <ZenLink to="/docs" class="nav-link {isActive('/docs') ? 'active' : ''}">
      Docs
    </ZenLink>
  </nav>
</template>
```

### Blog Post Cards

```html
<script>
  const posts = [
    { slug: 'intro-to-zenith', title: 'Intro to Zenith', excerpt: 'Get started with...' },
    { slug: 'advanced-routing', title: 'Advanced Routing', excerpt: 'Deep dive into...' },
    { slug: 'state-management', title: 'State Management', excerpt: 'Learn how to...' }
  ];
</script>

<style>
  .posts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
  .post-card { padding: 1.5rem; background: var(--bg-card); border-radius: 0.75rem; }
  .post-title { margin: 0 0 0.5rem; font-size: 1.25rem; }
  .post-excerpt { color: var(--text-secondary); margin-bottom: 1rem; }
  .read-more { color: var(--color-accent); text-decoration: none; font-weight: 500; }
  .read-more:hover { text-decoration: underline; }
</style>

<template>
  <div class="posts-grid">
{#each posts as post}
      <article class="post-card">
        <h3 class="post-title">{post.title}</h3>
        <p class="post-excerpt">{post.excerpt}</p>
        <ZenLink to="/blog/{post.slug}" class="read-more" prefetch>
          Read More →
        </ZenLink>
      </article>
{/each}
  </div>
</template>
```

### Breadcrumbs

```html
<script>
  const breadcrumbs = [
    { path: '/', label: 'Home' },
    { path: '/products', label: 'Products' },
    { path: '/products/widgets', label: 'Widgets' }
  ];
</script>

<style>
  .breadcrumbs { display: flex; gap: 0.5rem; font-size: 0.875rem; color: var(--text-muted); }
  .breadcrumbs a { color: var(--text-secondary); text-decoration: none; }
  .breadcrumbs a:hover { color: var(--text-primary); text-decoration: underline; }
  .breadcrumb-separator { color: var(--text-muted); }
  .breadcrumb-current { color: var(--text-primary); font-weight: 500; }
</style>

<template>
  <nav class="breadcrumbs">
{#each breadcrumbs as crumb, index}
{#if index < breadcrumbs.length - 1}
        <ZenLink to="{crumb.path}">{crumb.label}</ZenLink>
        <span class="breadcrumb-separator">/</span>
{:else}
        <span class="breadcrumb-current">{crumb.label}</span>
{/if}
{/each}
  </nav>
</template>
```

### Call-to-Action Buttons

```html
<style>
  .cta-group { display: flex; gap: 1rem; }
  .cta-primary {
    padding: 0.875rem 1.75rem;
    background: var(--color-accent);
    color: white;
    border-radius: 0.5rem;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .cta-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .cta-secondary {
    padding: 0.875rem 1.75rem;
    border: 2px solid var(--color-border);
    border-radius: 0.5rem;
    font-weight: 500;
    text-decoration: none;
  }
</style>

<template>
  <div class="cta-group">
    <ZenLink to="/signup" class="cta-primary" prefetch>
      Get Started Free
    </ZenLink>
    <ZenLink to="/demo" class="cta-secondary">
      Watch Demo
    </ZenLink>
  </div>
</template>
```

---

## When to Use ZenLink vs `<a>`

| Scenario | Use |
|----------|-----|
| Internal page navigation | `<ZenLink>` ✅ |
| External website links | `<ZenLink>` ✅ (auto-detected) |
| Anchor links (`#section`) | `<a href="#section">` |
| Download links | `<a href="/file.pdf" download>` |
| JavaScript actions | `<button onclick={...}>` |

---

## Accessibility

ZenLink is built with accessibility in mind:

- ✅ Proper `<a>` element with `href`
- ✅ Keyboard navigable (Tab, Enter)
- ✅ Screen reader compatible
- ✅ Focus states preserved

For enhanced accessibility:

```html
<ZenLink 
  to="/products" 
  aria-label="View all products"
  title="Browse our product catalog">
  Products
</ZenLink>
```

---

## Next Steps

- [Reactive State](/docs/router/reactive-state) - Access route info
- [Prefetching](/docs/router/prefetching) - Performance optimization
- [Router API](/docs/router/api) - Programmatic navigation
