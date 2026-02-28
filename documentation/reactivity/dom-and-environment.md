---
title: "DOM and Environment"
description: "Canonical patterns for refs, zenWindow/zenDocument, zenOn, zenResize, and collectRefs."
version: "0.3"
status: "canonical"
last_updated: "2026-02-28"
tags: ["reactivity", "dom", "environment", "refs"]
nav:
  order: 12
---

# DOM and Environment

## Contract: Refs and Mount-Time Readiness

Use `ref<T>()` for DOM handles. Refs are assigned by the runtime before `zenMount` callbacks run.

Invariant: Inside a `zenMount` callback, `ref.current` is set when the ref binding exists in the hydration payload.

## Contract: SSR-Safe Environment Access

Use `zenWindow()` and `zenDocument()` for global DOM access. They return `null` when not in the browser (SSR).

```ts
zenMount((ctx) => {
  const win = zenWindow();
  const doc = zenDocument();
  if (!win || !doc) return;
  // ... browser-only logic
});
```

## Contract: Event Subscriptions

Use `zenOn(target, eventName, handler, options?)` for event subscriptions. Returns a disposer. Register it with `ctx.cleanup`:

```ts
zenMount((ctx) => {
  const doc = zenDocument();
  if (!doc) return;
  const offKey = zenOn(doc, 'keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
  ctx.cleanup(offKey);
});
```

Or return the disposer:

```ts
zenMount(() => {
  const doc = zenDocument();
  if (!doc) return () => {};
  return zenOn(doc, 'keydown', handleKey);
});
```

## Contract: Resize-Driven Updates

Use `zenResize(handler)` for window-resize-driven reactive updates. Returns a disposer.

```ts
zenMount((ctx) => {
  const off = zenResize(({ w, h }) => {
    viewport.set({ w, h });
  });
  ctx.cleanup(off);
});
```

## Contract: Deterministic Multi-Node Operations

Use `collectRefs(...refs)` for deterministic node lists instead of selector scans.

```ts
const nodes = collectRefs(linkRefA, linkRefB, linkRefC);
```

## Migration: Selector-Based to Canonical

Before:

```ts
const el = document.querySelector('[data-nav]');
window.addEventListener('resize', onResize);
document.addEventListener('keydown', onKey);
```

After:

```ts
const navRef = ref<HTMLElement>();

zenMount((ctx) => {
  const win = zenWindow();
  const doc = zenDocument();
  if (!win || !doc) return;

  const offResize = zenResize(({ w, h }) => viewport.set({ w, h }));
  ctx.cleanup(offResize);

  const offKey = zenOn(doc, 'keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
  ctx.cleanup(offKey);
});
```

For multiple refs:

```ts
const nodes = collectRefs(linkRefA, linkRefB, linkRefC);
```

## See Also

- [Effects vs Mount](/docs/reactivity/effects-vs-mount)
- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Primitives and Patterns](/docs/reference/primitives-patterns)
