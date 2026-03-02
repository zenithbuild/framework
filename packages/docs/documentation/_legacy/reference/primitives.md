---
title: "Primitives"
order: 1
---

# Primitives: The Foundation Stones

From simple state to collections grand,
The primitives are yours to command.
A toolbox filled with logic and light,
To help you build with all of your might.

Each one a gem, each one a key,
To set your web applications free.

---

## 💎 Core Primitives

Zenith's API is intentionally small. We prefer powerful, multi-purpose primitives over dozens of specialized functions.

### `state` (Keyword)
The primary reactive primitive. Declared in the `<script setup>` block.
- **Usage**: `state variableName = initialValue`
- **Behavior**: Tracks changes and triggers surgical DOM updates.

### `zenCollection(name)`
Fetches a content collection from the `content/` directory.
- **Returns**: A query builder object.
- **Methods**: `.where()`, `.sortBy()`, `.limit()`, `.fields()`, `.get()`.

### `props` (Object)
The object containing all data passed from a parent component.
- **Behavior**: Reactive but read-only for the child.

---

## 📦 Navigation & Routing (Upcoming)

### `zenNavigate(path)`
Programmatically change the current route.
- **Usage**: `zenNavigate('/blog/my-post')`

### `selectedDoc`
A reactive primitive that tracks the currently active document in a dynamic route.
- **Usage**: Automatically populated based on the URL and collection.

---

## 💡 Pro Tip: Custom Primitives

While Zenith provides the essentials, you can easily build your own primitives by combining `state` and standard JavaScript functions. Share them across components to create your own domain-specific logic.

**Next Step**: [Hooks Reference](../reference/hooks-reference.md)
