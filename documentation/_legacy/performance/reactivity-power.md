---
title: "Reactivity Power"
order: 3
---

# Reactivity Power: The Instant Spark

A change in the state, a ripple of light,
The UI responds, in a blink of the sight.
No diffing, no patching, no waiting for more,
The power of Zenith is what's at the core.

Direct and efficient, in every degree,
Reactivity sets your application free.

---

## ⚡ Beyond the Diff

Traditional frameworks (like React) use a "re-render" model. When something changes, they re-run your entire component, create a new virtual tree, and diff it against the old one. Zenith uses a **Reactive Signal** model.

### 1. Surgical Precision
Because Zenith knows exactly which DOM node is bound to which variable, it never re-renders more than it needs to. Updating a counter? *Only* that text node changes.

### 2. Consistent Metadata
Zenith's performance is consistent regardless of the size of your component. In a 5,000-line component, a single state change is just as fast as in a 5-line component.

### 3. Native Speed
Since Zenith updates the DOM directly using native properties (`textContent`, `className`, `setAttribute`), it bypasses the abstraction layers and memory overhead of a virtual DOM.

## 🛠 Reactive Primitives in Action

```javascript
<script setup="ts">
  state theme = 'dark'
  
  function toggle() {
    theme = theme === 'dark' ? 'light' : 'dark'
  }
</script>

<div class={theme}>
  <button onclick="toggle">Switch to {theme === 'dark' ? 'Light' : 'Dark'}</button>
</div>
```

In the example above, Zenith tracks the `theme` variable. When `toggle` is called, it updates exactly two things: the `class` of the div and the `text` of the button. The rest of the template is never even touched.

---

## 🌌 Deep Dive: Signal vs. Dirty Checking

Unlike Angular's "dirty checking" which scans everything repeatedly, Zenith's signals are purely "push-based." The data tells the UI "I have changed, update yourself." This eliminates the need for expensive "digest cycles" and ensures that your app remains responsive even under heavy load.

**Next Step**: [API Reference & Primitives](../reference/primitives.md)
