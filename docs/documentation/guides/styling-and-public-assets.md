---
title: "Styling and Public Assets"
description: "Use the local Tailwind entry, global styles, and repository-backed public assets in Zenith projects."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["styling", "tailwind", "assets"]
section: "Styling and UI"
sectionOrder: 5
order: 1
---

# Styling and Public Assets

Zenith compiles local CSS imports and the current starter integrates Tailwind v4 through a project-owned entry file.

## Tailwind Entry

```css
@import "tailwindcss";

@source "../**/*.{zen,ts,js}";
```

Import the local file from a page or layout:

```zen
<script setup="ts">
import "../styles/globals.css"
</script>
```

Do not import bare `tailwindcss` from a `.zen` script or add a separate generated `output.css` step. `zenith dev` and `zenith build` own compilation of the local Tailwind entry.

## Component Styling

Use Tailwind tokens and `dark:` variants in component markup. Keep theme values in the Tailwind configuration rather than duplicating raw colors across components.

## Public Assets

Place files that need stable public URLs under `src/public/`:

```text
src/public/logo.svg -> /logo.svg
```

Use semantic image markup with useful alternative text and reserve dimensions when the asset size is known.

Next: [Pages, Layouts, and Dynamic Routes](/docs/routing/pages-layouts-and-dynamic-routes).
