---
title: "Composition"
order: 2
---

# Composition: The Art of Assembly

A piece of the whole, a part of the grand,
Composing with care, across the wide land.
With slots for the children, and layout as guide,
There's nowhere for messy or dull code to hide.

From simple to complex, the structure will grow,
As pieces of logic and beauty all flow.

---

## 🏗 Component Composition

Zenith encourages building complex interfaces by composing small, reusable components.

### 1. Simple Nesting

You can import and use components within each other just like standard HTML tags.

```html
<script setup="ts">
  import Button from './Button.zen'
</script>

<div>
  <Button label="Save" />
  <Button label="Cancel" secondary />
</div>
```

### 2. Using Slots

The `<slot />` tag allows you to pass content from a parent component into a specific location within a child component.

**BaseLayout.zen**
```html
<div class="layout">
  <header><slot name="header" /></header>
  <main><slot /></main>
  <footer><slot name="footer" /></footer>
</div>
```

**Page.zen**
```html
<BaseLayout>
  <h1 slot="header">Hello Zenith</h1>
  <p>This goes into the default slot.</p>
  <div slot="footer">© 2026 Zenith</div>
</BaseLayout>
```

## 🔄 Dynamic Composition

Since Zenith uses JavaScript for logic, you can dynamically choose which component to render.

```html
<script setup="ts">
  import List from './List.zen'
  import Grid from './Grid.zen'
  
  state viewMode = 'grid'
</script>

<div>
  <button onclick={() => viewMode = 'grid'}>Grid</button>
  <button onclick={() => viewMode = 'list'}>List</button>

  {viewMode === 'grid' ? <Grid /> : <List />}
</div>
```

---

## 💡 Pro Tip: Recursive Composition

Zenith handles recursive components (a component that renders itself) gracefully. This is perfect for tree structures, comment threads, or nested menus. Just make sure you have a clear "base case" to prevent infinite loops!

**Next Step**: [Best Practices](../components/best-practices.md)
