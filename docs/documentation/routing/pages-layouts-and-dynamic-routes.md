---
title: "Pages, Layouts, and Dynamic Routes"
description: "Map page files to static, parameter, catch-all, and layout-backed Zenith routes."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["routing", "pages", "layouts"]
section: "Pages and Routing"
sectionOrder: 3
order: 1
---

# Pages, Layouts, and Dynamic Routes

Zenith derives public route shapes from files under the configured pages directory. The server route manifest remains authoritative for direct requests.

## Static Pages

```text
src/pages/index.zen  -> /
src/pages/about.zen  -> /about
src/pages/docs.zen   -> /docs
```

## Dynamic Pages

```text
src/pages/blog/[id].zen       -> /blog/:id
src/pages/docs/[...slug].zen  -> /docs/*slug
src/pages/[[...slug]].zen     -> /*slug?
```

Dynamic values are available through `ctx.params` in server route code. Catch-all segments must be terminal, and structurally ambiguous route files are rejected.

## Layouts

Layouts provide shared document or page structure and render parent-owned page content through `<slot />`. A document-mode layout may provide `<html>`, `<head>`, and `<body>`, but the page still owns route identity.

## Navigation

Use semantic `<a href="...">` links. Client navigation is an opt-in enhancement over server-authoritative route output; it does not replace direct-load, refresh, 404, redirect, or guard behavior.

Next: [Routing Contract](/docs/contracts/routing).
