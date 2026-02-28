---
title: "Minimal Runtime"
order: 2
---

# Minimal Runtime: The Lightweight Soul

A whisper, a breath, a fragment of code,
Lightening the weight of the user's heavy load.
No massive libraries to download and parse,
Just the logic you need, without being sparse.

A framework so thin, it almost is not,
Yet powerful enough to use all that you've got.

---

## 🏗 The "Zero-Overhead" Goal

Traditional frameworks often ship 50KB to 100KB of runtime code just to render a "Hello World." Zenith takes a different approach.

### 1. Tailored Runtimes
Zenith doesn't ship a "one-size-fits-all" library. Instead, the compiler analyzes your page and generates a **tailored runtime bundle**. If your page doesn't use arrays, the array-flattening logic is omitted. If you have no events, the event-binding engine is left behind.

### 2. No Virtual DOM
Virtual DOMs require a lot of code to manage the diffing and patching process. By using **Signal-based reactivity** and direct DOM updates, Zenith completely removes this requirement, shrinking the runtime from tens of kilobytes to just a few.

### 3. Smallest Hydration Payload
Because Zenith uses static HTML with tiny hydration markers, the amount of data the browser needs to process to make your page "interactive" is the smallest in the industry.

## 📊 Bundle Size Comparison

| Framework | Runtime Size (min/gz) |
| :--- | :--- |
| React + ReactDOM | ~42KB |
| Vue | ~33KB |
| Svelte | ~2KB (per component) |
| **Zenith** | **< 1.5KB (Base)** |

---

## 💡 Pro Tip: Pre-compilation

By moving the complexity of the framework into the **Compiler**, we ensure that the user pays the price in build time (which is already extremely fast) rather than in runtime performance. This shift is what allows Zenith to remain so remarkably lightweight.

**Next Step**: [Reactivity Power](../performance/reactivity-power.md)
