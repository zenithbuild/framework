---
title: "Hello World"
order: 3
---

# Hello World: The Iterative Song

Ten thousand stars may shimmer in the sky,
We map them all, as logic passes by.
From collections deep, where data finds its rest,
We pull the strings, and put them to the test.

A simple list, a loop of pure delight,
To fill the screen and satisfy the sight.

---

## 🌍 The Classic Hello World

In Zenith, a "Hello World" is rarely just static text. It's often a dynamic list powered by our content engine.

```html
<script setup="ts">
  import { zenCollection } from 'zenith:content'
  
  // Fetch our features from the content collection
  const features = zenCollection('features').get()
</script>

<section class="grid gap-4">
  {features.map(f => (
    <div class="p-6 border rounded-xl">
      <h2 class="text-xl font-bold">{f.title}</h2>
      <p>{f.description}</p>
    </div>
  ))}
</section>
```

## 🔄 Iteration with `.map()`

Zenith embraces the standard JavaScript `.map()` method for rendering lists. 

### Why `.map()`?
- **Familiarity**: If you know JavaScript, you know Zenith loops.
- **Flexibility**: You can filter, sort, and transform your data right in the expression.
- **Performance**: Zenith's compiler optimizes these iterations for minimal DOM churn.

## 📦 Using `zenCollection`

The `zenCollection` function is your gateway to the `content/` directory. It provides a fluent API for querying your markdown and JSON data.

```javascript
const posts = zenCollection('blog')
  .where(p => p.status === 'published')
  .sortBy('date', 'desc')
  .limit(5)
  .get()
```

---

## 🧠 Optional Deep Dive: Array Flattening

When you use `.map()` in a template, it returns an array of DOM nodes. Zenith's runtime automatically flattens these arrays and handles the insertion into the parent element, ensuring that you don't have to worry about fragments or wrapper elements.

**Next Step**: [Understanding Expressions](../syntax/expressions.md)
