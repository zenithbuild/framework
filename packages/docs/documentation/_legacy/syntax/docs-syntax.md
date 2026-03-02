---
title: "Content Engine"
order: 3
---

# Content Engine: The Librarian's Key

From folders deep, where markdown finds its grace,
We pull the tales and give them each a space.
No JSON files to clutter up the view,
Just `zenith:content`, bringing what is true.

The docs, the blogs, the features of the day,
Are organized the Zenith- Librarian's way.

---

## 📚 Introduction to `zenith:content`

Zenith features a first-class content engine designed for speed and simplicity. It allows you to transform directories of markdown or JSON files into queryable collections.

### Fetching a Collection

```html
<script setup="ts">
  import { zenCollection } from 'zenith:content'

  const docs = zenCollection('documentation').get()
</script>

<div class="space-y-4">
  {docs.map(doc => (
    <a href={`/docs/${doc.id}`} class="block p-4 border rounded">
      {doc.title}
    </a>
  ))}
</div>
```

## 🔍 Querying Content

The `zenCollection` API provides a powerful set of chainable methods to refine your data.

```javascript
const recentBlogs = zenCollection('blog')
  .where(b => b.draft !== true)
  .sortBy('date', 'desc')
  .limit(3)
  .get()
```

### Supported Methods:
- `.where(predicate)`: Filter items using a function.
- `.sortBy(field, order)`: Sort by a field (ascending or descending).
- `.limit(number)`: Restrict the number of items returned.
- `.fields(array)`: Select only specific properties to reduce memory usage.

## 📝 Markdown Processing

When you fetch a markdown file, Zenith provides both the frontmatter (metadata) and the compiled HTML content.

```html
<article>
  <h1>{doc.title}</h1>
  <div class="prose">
    {/* Zenith handles the HTML string injection safely */}
    {doc.content}
  </div>
</article>
```

---

## 🌌 Deep Dive: Lazy Loading

`zenith:content` doesn't load everything at once. It intelligently parses only what you ask for, ensuring that your initial build remains light and your site stays fast, even with thousands of documents.

**Next Step**: [State & Reactivity](../reactivity/state.md)
