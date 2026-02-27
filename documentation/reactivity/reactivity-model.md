---
title: "Reactivity Model"
description: "Canonical primitives and scope boundaries for state, signal, ref, and slot ownership."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["reactivity", "state", "scope"]
nav:
  order: 10
---

# Reactivity Model

## Primitives

### `state`
Use `state` for values that directly drive DOM updates.

```zen
<script lang="ts">
state open = false
function toggle() { open = !open }
</script>

<button on:click={toggle}>{open ? "Open" : "Closed"}</button>
```

### `signal`
Use `signal()` for stable identity and explicit `get()`/`set()`, especially for frequent updates and cross-boundary bindings.

```ts
const count = signal(0)
count.set(count.get() + 1)
```

### `ref`
Use `ref<T>()` for DOM handles (focus management, measurement, animation).

```ts
const shell = ref<HTMLDivElement>()
```

## ZEN-RULE-300: Slot Expressions Preserve Parent Scope

Slot content always resolves against parent scope.

## ZEN-RULE-301: Component Local State Does Not Rebind Slots

Component-local state/signal affects component-owned markup only, unless explicitly passed outward.

## Example

```zen
<script lang="ts">
state parentOpen = false
</script>

<Nav>
  <span>{parentOpen ? "Parent Open" : "Parent Closed"}</span>
</Nav>
```

In slot content, `parentOpen` resolves to the parent binding, not internal `Nav` state.

## See Also

- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
- [Events](/docs/syntax/events)
- [Zenith Contract](/docs/zenith-contract)
