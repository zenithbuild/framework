---
title: "Project Structure"
description: "Understand the generated pages, layouts, styles, public assets, and Zenith configuration."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["getting-started", "project", "routes"]
section: "Getting Started"
sectionOrder: 1
order: 3
---

# Project Structure

Zenith keeps route and document ownership visible in the filesystem. The exact starter can add files, but the main boundaries stay the same.

## Generated Layout

```text
src/
  layouts/
    DefaultLayout.zen
  pages/
    index.zen
  public/
    logo.svg
  styles/
    globals.css
zenith.config.js
package.json
```

## Pages

Files under the configured `pagesDir` become routes. `src/pages/index.zen` owns `/`, while `src/pages/about.zen` owns `/about`.

## Layouts and Components

Layouts own shared document or page structure and expose a `<slot />` for page content. Put reusable interface boundaries in `src/components/` when the project needs them.

## Styles

The Tailwind starter imports `src/styles/globals.css` from its default layout. That local file imports Tailwind and declares the `.zen` source paths Tailwind should scan.

## Public Assets

Files under `src/public/` are copied to the public root. For example, `src/public/logo.svg` is referenced as `/logo.svg`.

## Configuration

`zenith.config.js` defines values such as `pagesDir`, the output target, and the TypeScript default. Keep route policy in this code-owned configuration rather than editable page content.

Next: [Your First Page](/docs/getting-started/first-page).
