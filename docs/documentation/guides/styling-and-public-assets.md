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

## Optimized Images

In 0.9, the `<Image>` component still ships in `@zenithbuild/cli`, and image optimization (Sharp) ships in the optional `@zenithbuild/image` package. Projects that use `<Image>` must install the package at the exact same version as `@zenithbuild/cli`:

```bash
npm install -D @zenithbuild/image@0.9.0-rc.0
```

> To install a 0.9.0 release candidate, use its exact version (as above) or the `train` tag (`@zenithbuild/image@train`). Either way, it must exactly match your `@zenithbuild/cli` version.

If a `.zen` file in the source directory uses `<Image>` and the package is missing or on a different version, `zenith dev` and `zenith build` stop before compiling and print the install command for your package manager. A project-defined `Image.zen` takes precedence over the built-in component and doesn't require the package.

Without `<Image>`, the package is optional. JPG, JPEG, PNG, WebP, and AVIF files in `public/` or `src/public/` are copied unoptimized when it is not installed, and the build prints an install hint. When it is installed, they are optimized. Projects with no images need neither the package nor Sharp.

### Upgrading from 0.8: remote images

In 0.8, the CLI transformed remote images served through `/_zenith/image` with Sharp. From 0.9, projects that set `images.remotePatterns` and serve remote images through `/_zenith/image` must install `@zenithbuild/image`. Without it, a remote URL that passes the usual checks answers `400` with `image_request_failed` and the message "Remote image optimization requires @zenithbuild/image. Install it and rebuild." URLs that fail those checks, such as loopback or private-network hosts, still get the same errors as before.

Local images aren't affected by this change.

Next: [Pages, Layouts, and Dynamic Routes](/docs/routing/pages-layouts-and-dynamic-routes).
