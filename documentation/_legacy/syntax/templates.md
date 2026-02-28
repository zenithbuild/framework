---
title: "Templates"
order: 2
---

# Templates: The Canvas of Creation

A tag of div, a span of azure hue,
The Zenith canvas waits for what is true.
With JSX-like grace, the structure stands,
A product of your mind and steady hands.

No complex directives to learn by heart,
Just HTML and logic, a work of art.

---

## 🎨 Zenith Template Syntax

Zenith templates use a familiar, JSX-inspired syntax that stays close to standard HTML. There are no specialized directives like `v-if` or `*ngFor`. Instead, we use JavaScript.

### Standard HTML Tags

Standard HTML tags work exactly as you expect. You can use Tailwind classes, standard attributes, and nesting.

```html
<div class="flex gap-4">
  <span class="text-sm">Metadata</span>
  <hr class="flex-1 opacity-10">
</div>
```

### Event Binding

Events are wired up using standard HTML attributes like `onclick`, `oninput`, or `onsubmit`.

```html
<button onclick="increment" class="btn">Add One</button>
<input oninput={(e) => text = e.target.value} />
```

### Attributes and Props

Attributes can be static strings or dynamic expressions.

```html
<!-- Static -->
<img src="/logo.svg" alt="Zenith Logo">

<!-- Dynamic -->
<img src={user.avatar} alt={user.name}>
```

## 🏗 Composition & Slots

Zenith supports component composition through a simple `<slot />` system.

### Defining a Layout (`DefaultLayout.zen`)
```html
<body class="bg-background">
  <nav>Navigation</nav>
  <main>
    <slot />
  </main>
  <footer>Footer</footer>
</body>
```

### Using a Layout (`index.zen`)
```html
<DefaultLayout>
  <h1>Main Content</h1>
</DefaultLayout>
```

---

## 💡 Pro Tip: Semantic HTML

Zenith encourages the use of semantic HTML. Since our compiler is lightweight and stays close to the metal, using the correct tags (like `<nav>`, `<article>`, `<section>`) not only helps with SEO and accessibility but also keeps your Zenith code clean and readable.

**Next Step**: [Content Engine Syntax](../syntax/docs-syntax.md)
