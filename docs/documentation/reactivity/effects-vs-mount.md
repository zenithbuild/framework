---
title: "zenEffect vs zenMount"
description: "When to use zenEffect vs zenMount for side effects and lifecycle."
version: "0.3"
status: "canonical"
last_updated: "2026-02-28"
tags: ["reactivity", "effects", "mount", "lifecycle"]
nav:
  order: 11
---

# zenEffect vs zenMount

## zenMount: DOM-Side Effects and Lifecycle

Use `zenMount` for:

- DOM-side effects that require actual nodes (GSAP, measurement, focus, observers)
- Event subscriptions tied to component lifetime
- Anything that must run only in the browser after DOM is ready

`zenMount` runs once per mount and cleans up on unmount. Register disposers with `ctx.cleanup` or return a cleanup function:

```ts
zenMount((ctx) => {
  const offResize = zenResize(({ w, h }) => viewport.set({ w, h }));
  ctx.cleanup(offResize);

  const offKey = zenOn(zenDocument(), 'keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
  ctx.cleanup(offKey);
});
```

Or return cleanup:

```ts
zenMount(() => {
  const off = zenResize(handler);
  return off;
});
```

## zenEffect: Reactive Side Effects

Use `zenEffect` for:

- Reactive side effects that must re-run when dependencies change
- Syncing derived state to imperative APIs (not DOM querying)
- Lightweight effects that should not depend on DOM refs unless explicitly safe

`zenEffect` can re-run frequently. It must be idempotent and cleanup correctly.

## Trade-offs

| | zenMount | zenEffect |
|---|---|---|
| Runs | Once per mount | Re-runs when deps change |
| Cleanup | On unmount | On re-run or unmount |
| DOM refs | Safe; refs ready | Avoid unless safe |
| Use case | Lifecycle-bound resources | Reactive sync |

## Do NOT

- Do NOT use `zenEffect` to scan DOM, querySelector, or attach event listeners repeatedly.
- Do NOT use `zenMount` to implement reactive loops; use `zenEffect`/state instead.
- Do NOT create custom window/document wrappers; use zenWindow/zenDocument.
- Do NOT use WeakMaps/disposer registries; use zenOn + zenMount cleanup.

## Examples

### GSAP animation with refs (zenMount)

```ts
zenMount((ctx) => {
  const el = navRef.current;
  if (!el) return;
  const tl = gsap.timeline();
  tl.to(el, { opacity: 1 });
  ctx.cleanup(() => tl.kill());
});
```

### Resize-driven state (zenResize + state)

```ts
const viewport = state({ w: 0, h: 0 });
zenMount((ctx) => {
  const off = zenResize(({ w, h }) => viewport.set({ w, h }));
  ctx.cleanup(off);
});
```

### Syncing signal to localStorage (zenEffect)

```ts
zenEffect(() => {
  const value = count.get();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('count', String(value));
  }
});
```

## See Also

- [DOM and Environment](/docs/reactivity/dom-and-environment)
- [Reactivity Model](/docs/reactivity/reactivity-model)
