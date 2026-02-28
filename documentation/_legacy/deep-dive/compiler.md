---
title: "Compiler"
order: 2
---

# Compiler: The Alchemist's Forge

The rawest text, the JSX so bold,
Is transformed here, refined to liquid gold.
It parses dreams and turns them into code,
To ease the burden of the developer's load.

The forge is hot, the logic sharp and keen,
The finest craft that code has ever seen.

---

## 💎 The Gemini Compiler

The compiler is the heart of Zenith. It's a multi-stage engine that transforms `.zen` files into optimized HTML and JavaScript.

### Stage 1: Parsing
The compiler breaks down your `.zen` file into an Intermediate Representation (IR). It separates the `<script>`, the template, and the `<style>`, while identifying all `{}` expressions.

### Stage 2: Transformation
This is where the magic happens. The compiler:
- **Analyzes Bindings**: It determines which expressions are static and which are dynamic.
- **Generates Markers**: It replaces expressions in the HTML with `data-zen-*` hydration markers.
- **Wraps Expressions**: It turns each expression into a browser-executable function.

### Stage 3: Code Generation
The final stage produces:
1. **Pure HTML**: A static skeleton ready for fast initial delivery.
2. **The Runtime Bundle**: A tailored script containing only the logic and hydration code needed for that specific page.

## 🏗 Compiler Roles

- **Static Analysis**: Determining what *can* change vs. what *won't* change. This allows Zenith to skip constant parts of your template during hydration.
- **Reactivity Wiring**: Automagically converting your `state` declarations into reactive proxies.
- **JSX to H-Functions**: Converting JSX-style tags inside expressions into efficient `__zenith.h()` calls.

---

## 🌌 Deep Dive: The Module System

Zenith's compiler isn't just a string replacer. It uses a sophisticated AST (Abstract Syntax Tree) transformation system. This allows us to perform advanced optimizations like "hoisting" static sub-trees out of loops, ensuring that your `features.map()` call is as efficient as a hand-coded manual update.

**Next Step**: [Array Flattening & Lists](../deep-dive/array-flattening.md)
