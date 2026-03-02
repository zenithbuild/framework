---
title: "Derived State"
order: 3
---

# Derived State

Derived values are declared from `state` and recomputed by Zenith when dependencies change.

## Canonical Pattern

```zen
<script lang="ts">
state count = 0;
state user = null;

const double = memo(() => count * 2);
const userStatus = zenMemo(() => (user ? "Active" : "Offline"));

function increment() {
  count += 1;
}
</script>

<button on:click={increment}>Count: {count}</button>
<p>Double: {double}</p>
<p>Status: {userStatus}</p>
```

## Rules

- Use `memo()` or `zenMemo()` for reusable derived values.
- Keep derivations pure. No DOM writes or side effects inside memo callbacks.
- Do not use framework-specific APIs such as `useMemo`, `computed`, or `createMemo`.
- Expression bindings in markup remain reactive and can be used directly for one-off values.

## Derived vs Effects

- `memo`/`zenMemo`: computes values.
- `zeneffect`: performs side effects (DOM APIs, animation engines, subscriptions).
