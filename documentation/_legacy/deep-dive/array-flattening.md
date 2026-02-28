---
title: "Array Flattening"
order: 3
---

# Array Flattening: The Recursive Stream

A list of nodes, a stream of nested life,
We smooth the edges, cutting through the strife.
From maps of maps, a single truth remains,
A flattened path, released from recursive chains.

It flows like water, filling every space,
With perfect order and a quiet grace.

---

## 🌊 Why Flatten?

When you use `.map()` in Zenith, you often end up with nested arrays, especially when components return multiple elements or when you nest loops. 

```html
{categories.map(cat => (
  cat.items.map(item => <li>{item}</li>)
))}
```

Without flattening, the browser wouldn't know how to render this "array of arrays" of DOM nodes.

## 🛠 How Zenith Handles It

Zenith's runtime includes a specialized "Flatten & Insert" logic.

1. **Infinite Flattening**: Using `Array.flat(Infinity)`, the runtime collapses all nested structures into a single linear list of nodes.
2. **Fragment Creation**: To ensure optimal performance during insertion, it creates a `DocumentFragment`.
3. **Atomic Replacement**: The entire flattened fragment is inserted into the expression's placeholder in one single DOM operation.

### The Benefits
- **No Wrapper Divs**: You don't need "Fragment" tags or extra `<div>` elements just to satisfy the loop.
- **Layout Integrity**: Because we don't force extra elements into the DOM, your CSS Grid and Flexbox layouts remain exactly as you designed them.
- **Reactivity Speed**: If one item in a nested list changes, Zenith only updates the relevant part of the DOM stream.

---

## 🌌 Deep Dive: The `display: contents` Secret

For expression wrappers that must exist in the HTML for hydration, Zenith automatically applies `style="display: contents;"`. This CSS property makes the wrapper "disappear" from the layout's perspective, allowing the flattened children to engage directly with the parent's CSS Grid or Flexbox rules.

**Next Step**: [Writing Components](../components/zen-components.md)
