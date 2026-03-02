---
title: FAQ & Troubleshooting
description: Common questions and solutions for Zenith Router issues.
section: Router
order: 9
---

# FAQ & Troubleshooting

Find answers to common questions and solutions to frequent issues.

---

## Frequently Asked Questions

### Do I need to install the router separately?

**No.** The router is included in `@zenithbuild/core`. If you have Zenith installed, you have the router.

### Can I use regular `<a>` tags?

You can, but for internal navigation use `<ZenLink>`:

- `<a href="/about">` → Full page reload
- `<ZenLink to="/about">` → SPA navigation

### Does the router work with SSR/SSG?

**Yes.** The router is hydration-safe and designed for SSR, SSG, and CSR.

### How do I handle 404 pages?

Create a catch-all route at `src/pages/[...404].zen`.

---

## Common Errors

### ❌ "Router outlet not found"

**Solution:** Add the outlet to your layout:

```html
<main id="zenith-outlet">
  <slot />
</main>
```

### ❌ Full page reload instead of SPA navigation

**Solution:** Use `<ZenLink>` instead of `<a>`:

```html
<ZenLink to="/about">About</ZenLink>
```

### ❌ Route changes not triggering updates

**Solution:** Subscribe to route changes:

```javascript
zenOnMount(() => {
  const unsubscribe = window.__zenith_router.onRouteChange(callback);
  zenOnUnmount(unsubscribe);
});
```

### ❌ Dynamic route params undefined

**Solution:** Access params in `zenOnMount`:

```javascript
zenOnMount(() => {
  const { params } = window.__zenith_router.getRoute();
  userId = params.id;
});
```

---

## Debugging Tips

### Check Route State

```javascript
console.log(window.__zenith_router.getRoute());
console.log(window.__zenith_router.isActive('/blog'));
```

### Verify Outlet Exists

```javascript
const outlet = document.querySelector('#zenith-outlet');
console.log('Outlet found:', !!outlet);
```

### Test Navigation Manually

```javascript
window.__zenith_router.navigate('/about');
```

---

## HMR Considerations

This page is legacy content. For active development behavior and endpoint guarantees, use the canonical [HMR V1 Contract](/docs/contracts/hmr-v1-contract).

---

## Getting Help

1. Check the console for error messages
2. Review the [Examples](/docs/router/examples)
3. Search [GitHub Issues](https://github.com/zenithbuild/zenith/issues)
