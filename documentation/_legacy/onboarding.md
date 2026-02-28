# Zenith Developer Onboarding Guide

Welcome to Zenith. Unlike traditional frameworks, Zenith is a **Compile-Time Authority**. This means the most important part of your code is not how it runs, but how it is proven.

## 1. The Zenith Mindset

- **Mechanical Certainty**: If it's not provable at build time, it shouldn't exist.
- **Symbolic Handles**: We don't pass closures to event listeners. we pass string symbols.
- **Deletability**: A feature is defined by how easily it can be removed without breaking the contract.

## 2. Writing Your First Component

Create a `.zen` file:

```html
<script>
  // State is automatically reactive
  state count = 0;

  // Functions are pre-compiled into "instructions"
  function increment() {
    count++;
  }
</script>

<!-- Event handlers MUST be symbolic names -->
<button on:click="increment">
  Count is {count}
</button>
```

### The "Illegal" Pattern
Do NOT do this:
```html
<!-- FORBIDDEN: Inline closures are executable, not symbolic -->
<button on:click={() => count++}> Fail </button>
```
The compiler will catch this and throw `Z-ERR-REF-001`.

## 3. Prop Declarations

Props are compile-time only. They are injected as identifiers.

```html
<script>
  // Declare and destructure props
  const { title } = props<{ title: string }>();
</script>

<h1>{title}</h1>
```

## 4. Forbidden Patterns (The Lockdown)

To maintain the Zenith Contract, the following are strictly forbidden:
1. **`eval()` or `new Function()`**: No runtime code evaluation.
2. **`document.querySelector()`**: Relying on DOM side-effects outside of `ref`.
3. **Non-Whitelisted Globals**: Accessing `window` or `process` directly in expressions without proof.

## 5. Workflow

1. **Write**: Create `.zen` files.
2. **Audit**: The compiler runs `validateIr` to check for contract violations.
3. **Analyze**: Use `zenith analyze` to see your symbolic instruction table.
4. **Ship**: The output is "dumb" JS and HTML.

## 6. Resources
- [Zenith Contract](./zenith-contract.md) (The source of truth)
- [Compiler API](./api/compiler.md)
- [Runtime API](./api/runtime.md)
