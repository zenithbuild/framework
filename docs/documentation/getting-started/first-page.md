---
title: "Your First Page"
description: "Edit a file-based route and add a canonical reactive interaction in a .zen page."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["getting-started", "pages", "zen"]
section: "Getting Started"
sectionOrder: 1
order: 4
---

# Your First Page

A `.zen` page combines explicit script ownership with semantic markup. The compiler resolves bindings and event intent from the file.

## Edit the Home Route

Replace the content of `src/pages/index.zen` with a small page:

```zen
<script setup="ts">
state count = 0

function increment() {
  count += 1
}
</script>

<DefaultLayout>
  <main>
    <h1>Hello from Zenith</h1>
    <button on:click={increment}>Count: {count}</button>
  </main>
</DefaultLayout>
```

Use `state` because the value drives a DOM expression. Pass the `increment` function to `on:click`; a direct call such as `on:click={increment()}` is invalid.

## Add Another Route

Create `src/pages/about.zen`:

```zen
<DefaultLayout>
  <main>
    <h1>About</h1>
    <a href="/">Back home</a>
  </main>
</DefaultLayout>
```

The file becomes `/about`. Keep navigation semantic with anchors; Zenith's navigation policy may enhance eligible anchors without changing direct-request truth.

Next: [Development Workflow](/docs/getting-started/development-workflow).
