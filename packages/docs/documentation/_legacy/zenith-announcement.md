# I Built a UI Framework That Doesn’t Use a Virtual DOM
## Introducing **Zenith**

Over the last few years, I’ve worked extensively with React, Vue, Next, Nuxt, Svelte, and compiler-adjacent tooling. Each of them solves real problems — but they also left me with a recurring question:

> **What if the compiler already knew everything before runtime ever existed?**

That question is what led me to build **Zenith**.

Zenith is a **compiler-first UI framework** that intentionally does **not** use a Virtual DOM, runtime diffing, or reactive boundaries. Not because those tools are bad — but because I wanted to explore what becomes possible when **certainty replaces reconciliation**.

This post is an announcement, not a sales pitch. Zenith is different by design, and that difference is intentional.

---

## Why I Started Building Zenith

Most modern UI frameworks share a common assumption:

> UI updates are a *runtime problem*.

State changes, components re-run, virtual trees are recreated, and the framework figures out what changed *after the fact*.

Zenith flips that assumption:

> UI updates are a **compile-time problem**.

Instead of asking *“what changed?”* at runtime, Zenith asks:

> *“What could ever change?”*
> …and answers that **before runtime exists**.

Once that answer is known, there’s nothing left to diff.

---

## What Zenith Is (and Isn’t)

**Zenith is:**
- Compiler-driven
- Structural by default
- Predictable and explicit
- Minimal at runtime ("Dumb Runtime")

**Zenith is not:**
- A Virtual DOM framework
- A reactive runtime
- A template engine
- A drop-in replacement for React or Vue

It’s a different axis entirely.

---

## A Simple Counter Example

### React
```jsx
function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}
```
This requires runtime re-execution and diffing.

### Zenith
Zenith enforces a strict separation:
```zenith
<script>
  state count = 0

  function increment() {
    count++
  }
</script>

<button onclick="increment">
  Count: {count}
</button>
```

At **compile time**, Zenith emits exact symbolic instructions:
1. Listen for `click` -> call `increment`.
2. `count` mutation -> update TextNode(id) directly.

At **runtime**, there is no component re-render, no virtual tree, and no guess work. The runtime blindly executes the compiler's orders.

## Compiler-Only Props

Zenith props are resolved at compile-time. There is no runtime `props` object overhead.

```zenith
<script props>
  prop title: string;
</script>
<h1>{title}</h1>
```
If you pass a static string, it is inlined. If you pass a dynamic value, it is bound directly to the target node.

---

## Why No Virtual DOM?

Zenith avoids the problem entirely.
- VDOM frameworks: Recompute → then optimize.
- Zenith: Prevents uncertainty → emits intent.

---

## Final Thought

Zenith isn’t trying to replace React or Vue. It’s asking a different question:

> **What if the compiler already knew everything?**

Welcome to Phase 6.
