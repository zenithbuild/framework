---
title: "Hooks Reference"
order: 2
---

# Hooks Reference: The Cycle of Life

A list of hooks, a reference clear,
To keep the cycle of components near.
From birth to death, and updates in between,
All covered here, so logic may be seen.

Signature and example, side by side,
So developer's intent may never hide.

---

## 🎣 Lifecycle Hooks

All hooks are imported from `zenith:core`.

### `zenOnMount(callback)`
Runs once after the component is added to the DOM.
- **Callback**: `() => void | Promise<void>`
- **Example**:
  ```javascript
  zenOnMount(() => {
    console.log("Component mounted!")
  })
  ```

### `zenOnUpdate(callback)`
Runs after every reactive update and DOM change.
- **Callback**: `() => void`
- **Example**:
  ```javascript
  const syncScroll = () => { /* ... */ }
  zenOnUpdate(() => {
    syncScroll()
  })
  ```

### `zenOnUnmount(callback)`
Runs once just before the component is removed from the DOM.
- **Callback**: `() => void`
- **Example**:
  ```javascript
  const subscription = { unsubscribe: () => {} }
  zenOnUnmount(() => {
    subscription.unsubscribe()
  })
  ```

### `zenOnBeforeUpdate(callback)`
Runs before the DOM is updated, but after state has changed.
- **Callback**: `() => void`

---

## 🧠 Optional Deep Dive: Async Hooks

While `zenOnMount` can be async, Zenith does not wait for it to resolve before finishing the mount cycle. If you need to wait for data, handle the loading state within your component:

```html
<script setup="ts">
  state loading = true
  zenOnMount(async () => {
    await fetch('/api/data')
    loading = false
  })
</script>

{loading ? <Spinner /> : <Content />}
```

**Next Step**: [Syntax Cheatsheet](../reference/syntax-cheatsheet.md)
