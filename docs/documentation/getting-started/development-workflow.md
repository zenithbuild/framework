---
title: "Development Workflow"
description: "Run Zenith locally, interpret diagnostics, and keep routes valid during normal development."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["getting-started", "development", "diagnostics"]
section: "Getting Started"
sectionOrder: 1
order: 5
---

# Development Workflow

Use the generated scripts as the normal project entry points.

## Start Development

```bash
npm run dev
```

Zenith discovers routes from the configured pages directory, compiles `.zen` files, and serves the development output. The Tailwind starter also compiles its local Tailwind entry inside the Zenith development loop.

## Work in Small Checks

1. Edit one page or component.
2. Read compiler diagnostics in the terminal.
3. Open the affected route directly.
4. Verify semantic links, keyboard behavior, and a hard refresh.
5. Run the project tests before building.

Unknown events produce compiler diagnostics with typo guidance. Invalid handler expressions, unsafe bindings, and ambiguous routes should be fixed at their source instead of hidden with browser-only workarounds.

## Keep Server Work on the Server

Primary route data belongs in `<script server lang="ts">` through `load(ctx)`. Protected outcomes use `guard(ctx)` or `load(ctx)` and remain server-enforced; client execution only improves navigation UX.

For common failures, use the [Error Reference](/docs/errors/index) and [Troubleshooting Guide](/docs/guides/troubleshooting).

Next: [Build and Preview](/docs/getting-started/build-and-preview).
