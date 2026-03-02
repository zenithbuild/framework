---
title: "First Component"
order: 2
---

# Your First Component: The Architect's Sketch

A script, a style, a tag within the frame,
Each Zenith block is known by its own name.
With `setup` set, and TypeScript in the heart,
You craft the logic for your visual art.

No boilerplate to drag your spirit down,
Just pure intent, the finest in the town.

---

## 🏗 Anatomy of a `.zen` File

Zenith components are structured as Single File Components (SFCs). They bring logic and layout together in a harmonious union.

```html
<script setup="ts">
  // Logic lives here
  state message = "Hello, Zenith!"
  
  function update() {
    message = "You clicked it!"
  }
</script>

<div class="p-8 text-center">
  <h1 class="text-4xl font-bold">{message}</h1>
  <button onclick="update" class="mt-4 px-4 py-2 bg-primary text-white rounded">
    Click Me
  </button>
</div>

<style>
  /* Optional component styles */
  h1 { color: var(--primary); }
</style>
```

## 🔍 Breaking it Down

### 1. The Script Block
The `<script setup="ts">` tag is the brain of your component. 
- **State**: Declared with the `state` keyword. It's reactive by default—update the variable, and the DOM follows.
- **Functions**: Regular JavaScript functions serve as your event handlers.

### 2. The Template
Everything outside the `<script>` and `<style>` tags is your template.
- **Expressions**: Wrapped in curly braces `{}`. They can be simple variables or complex logic.
- **Events**: Standard HTML event names (like `onclick`) just work.

### 3. The Style Block (Optional)
Scoped styles that only affect this component. Zenith automatically handles the isolation for you.

---

## 💡 Pro Tip: Reactive State

Unlike other frameworks that require `useState` or `Ref`, Zenith's `state` keyword is a compiler directive. It tells Zenith to watch this variable for changes.

```javascript
state count = 0
count++ // The UI updates automatically!
```

**Next Step**: [Hello World & Loops](../getting-started/hello-world.md)
