---
title: Introduction
description: Learn about Zenith's built-in SPA router with compile-time validation, zero configuration, and seamless hydration.
section: Router
order: 1
---

# Zenith Router

> **Built-in SPA routing with compile-time validation, zero configuration, and seamless hydration.**

## What is the Zenith Router?

The Zenith Router is a **built-in, file-based SPA router** that comes pre-integrated with `@zenithbuild/core`. No additional installation or setup is required—routing is available out-of-the-box.

The router provides:

- **File-based routing**: Your `src/pages/` directory structure automatically defines routes
- **SPA navigation**: Smooth client-side transitions without full page reloads
- **Compile-time validation**: Route patterns are analyzed and validated during build
- **Zero-config**: Works immediately with Zenith projects
- **Hydration-safe**: Built for SSR/SSG with seamless client-side takeover
- **TypeScript-ready**: Full type safety for route parameters and navigation

## Why Does It Exist?

Traditional routers force you to:
1. Manually configure every route
2. Handle runtime pattern matching
3. Manage complex initialization code
4. Deal with hydration mismatches

Zenith Router eliminates all of this. Routes are **discovered at build time** from your file structure, validated for correctness, and ready to use with zero configuration.

## Key Benefits

### ✅ Deterministic Routing

Routes are discovered and validated at compile-time. If a route is misconfigured, you'll know before deployment—not from a user error report.

```
src/pages/
├── index.zen          → /
├── about.zen          → /about
├── blog/
│   ├── index.zen      → /blog
│   └── [slug].zen     → /blog/:slug
└── docs/
    └── [...path].zen  → /docs/*
```

### ✅ SPA Performance

Navigate between pages instantly without full page reloads. The router handles:
- History management (back/forward buttons work)
- State preservation during navigation
- Prefetching for instant transitions

### ✅ Hydration-Safe

Built specifically for server-rendered content. The router:
- Attaches to existing DOM seamlessly
- Preserves server-rendered content
- Activates client-side interactivity without flicker

### ✅ Simple API

```javascript
// Navigate programmatically
window.__zenith_router.navigate('/about');

// Check if route is active
window.__zenith_router.isActive('/blog');

// Get current route info
const { path, params, query } = window.__zenith_router.getRoute();
```

### ✅ Developer Experience

The router is designed for DX:
- No boilerplate configuration
- Intuitive file-based conventions
- Helpful error messages at compile time
- TypeScript support throughout

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    BUILD TIME                            │
├─────────────────────────────────────────────────────────┤
│  1. Discover .zen files in src/pages/                   │
│  2. Generate route patterns from file paths             │
│  3. Validate patterns (no conflicts, valid params)      │
│  4. Compile route manifest into bundle                  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    RUNTIME                               │
├─────────────────────────────────────────────────────────┤
│  1. Router initializes with compiled manifest           │
│  2. ZenLink intercepts clicks → SPA navigation          │
│  3. History API manages browser back/forward            │
│  4. Route changes trigger reactive updates              │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

Ready to dive in? Here's the 30-second setup:

**1. Create pages** in `src/pages/`:

```
src/pages/
├── index.zen
└── about.zen
```

**2. Add a router outlet** in your layout:

```html
<main id="zenith-outlet">
  <slot />
</main>
```

**3. Use ZenLink** for navigation:

```html
<ZenLink to="/about">About Us</ZenLink>
```

That's it! You now have SPA navigation.

---

## Next Steps

- [Getting Started](/docs/router/getting-started) - Full setup guide
- [ZenLink Component](/docs/router/zenlink) - Navigation component reference
- [Router API](/docs/router/api) - Complete API documentation
