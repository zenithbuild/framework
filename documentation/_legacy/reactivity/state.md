---
title: "State"
order: 1
---

# State

`state` is the canonical way to declare reactive values in Zenith component scripts.

## Canonical Syntax

```zen
<script lang="ts">
state count = 0;
state profile = {
  name: "Zenith",
  theme: "dark"
};

function increment() {
  count += 1;
}

function toggleTheme() {
  profile.theme = profile.theme === "dark" ? "light" : "dark";
}
</script>

<button on:click={increment}>Count: {count}</button>
<button on:click={toggleTheme}>Theme: {profile.theme}</button>
```

## Arrays and Objects

```zen
<script lang="ts">
state items = ["Compiler", "Router"];

function addItem() {
  items.push("Runtime");
}
</script>

<button on:click={addItem}>Add</button>
<p>Total: {items.length}</p>
```

## Rules

- Declare reactive values with `state`.
- Mutate state directly (`count += 1`, `items.push(...)`, `user.name = ...`).
- Use object-based event handlers (`on:click={handler}`).
- Do not use framework-specific primitives (`useState`, `ref()`, `computed()`, `createMemo()`).
