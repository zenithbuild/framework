---
title: "Build Speed"
order: 1
---

# Build Speed: The Velocity of Thought

A flickering flame, a flash in the dark,
The Zenith compiler, ignite the first spark.
No waiting for bundles, no stalling for time,
A process of logic, in perfect design.

From source into browser, in heartbeat or less,
A tribute to speed, we're proud to profess.

---

## ⚡ Why Zenith is Fast

Zenith's performance isn't an afterthought; it's the foundation. We achieve industry-leading build speeds through several key strategies:

### 1. In-Memory Compilation (Dev Mode)
In development, Zenith compiles your `.zen` files on-the-fly directly in memory. There are no intermediate build artifacts to write to disk, which means HMR (Hot Module Replacement) happens in the blink of an eye.

### 2. Static Analysis
Zenith's compiler is "smart." It analyzes your templates to distinguish between static content (which will never change) and dynamic bindings. It constant-folds and hoists the static parts, so they are never even looked at during the runtime update cycle.

### 3. Bundler-Less Architecture
Because we target modern browsers and rely on Bun for module resolution, we avoid the heavy "bundling" tax that plagues many older frameworks. Each page gets a tailored script containing only what it needs, and nothing more.

## 🚀 The Bun Advantage

Zenith is built specifically for the [Bun](https://bun.sh) ecosystem. By leveraging Bun's lightning-fast native transpiler and linker, we can process thousands of lines of code in milliseconds.

| Operation | Zenith (Bun) | Typical Webpack/Vite |
| :--- | :--- | :--- |
| Initial Dev Start | ~100ms | 1s - 5s |
| HMR Update | ~10ms | 100ms - 500ms |
| Production Build | < 2s | 10s - 60s |

---

## 🌌 Deep Dive: Incremental Builds

Zenith uses a sophisticated caching system. When you change a single component, only that component is re-transformed. We don't re-parse your entire project, ensuring that your build speed scales linearly with the size of your changes, not the size of your codebase.

**Next Step**: [Minimal Runtime](../performance/minimal-runtime.md)
