---
title: "Best Practices"
order: 3
---

# Best Practices: The Way of the Zenith

A path that is narrow, a path that is wide,
With Wisdom of Zenith as your constant guide.
Keep state at the minimum, keep components lean,
And keep every template both clear and pristine.

Follow the patterns that lead to the light,
And keep your web projects performing and bright.

---

## ✅ Do's: The Zenith Path

### 1. Keep State Minimal
Only use the `state` keyword for data that *actually* needs to trigger a UI update. For static configuration or derived values that don't change, a standard `const` or `let` is more efficient.

### 2. Leverage `zenCollection`
When dealing with documentation, blogs, or any static data, use the `zenCollection` API. It's optimized for build speed and provides a cleaner interface than manual file imports.

### 3. Embrace Utility-First CSS
Zenith works beautifully with Tailwind CSS. Using utilities directly in your templates keeps your `.zen` files compact and your design system consistent.

### 4. Components should be Small
If a component grows beyond a few hundred lines, it's usually a sign that it should be broken down into smaller, more focused sub-components.

## ❌ Don'ts: The Pitfalls

### 1. Don't Over-Reactive
Avoid wrapping every single variable in `state`. Excessive reactivity can lead to unnecessary tracking overhead and "update storms."

### 2. Don't Manipulate DOM Manually
Zenith is designed to be declarative. If you find yourself using `document.getElementById` or `element.appendChild`, try to rethink the problem using Zenith's reactive state and templates.

### 3. Don't Ignore Cleanup
When using global event listeners or timers in `zenOnMount`, always provide a cleanup function in `zenOnUnmount` to prevent memory leaks and unexpected behavior.

---

## 🌌 Deep Dive: Prop Drilling

For very deep component trees, "prop drilling" (passing data through multiple layers of components) can become tedious. In these cases, consider using a global reactive store or Zenith's upcoming "Context" API to provide data to deep descendants without manual threading.

**Next Step**: [Performance & Build Speed](../performance/build-speed.md)
