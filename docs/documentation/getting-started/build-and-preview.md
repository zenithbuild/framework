---
title: "Build and Preview"
description: "Create production output, preview the configured target, and choose the next documentation path."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["getting-started", "build", "preview"]
section: "Getting Started"
sectionOrder: 1
order: 6
---

# Build and Preview

Build before deployment so compiler, route, asset, and target diagnostics fail locally.

## Create Production Output

```bash
npm run build
```

The output follows the target in `zenith.config.js`. A protected route that exports `guard` or `load` cannot also be prerendered.

## Preview the Result

```bash
npm run preview
```

Preview uses Zenith's target-aware output behavior. Test direct loads, browser Back, dynamic routes, missing routes, and public assets against the preview server.

## Continue Learning

- Learn component boundaries in [Components, Props, and Slots](/docs/components/components-props-and-slots).
- Learn reactive ownership in [Reactivity Model](/docs/reactivity/reactivity-model).
- Learn route shapes in [Pages, Layouts, and Dynamic Routes](/docs/routing/pages-layouts-and-dynamic-routes).
- Learn server loading in [Script Server Reference](/docs/reference/script-server).
- Review target behavior in [Deployment Targets](/docs/guides/deployment-targets).
