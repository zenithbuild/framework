---
title: "Getting Started"
description: "Create a Zenith project, run the development server, and follow the shortest path to a first page."
version: "0.8"
status: "canonical"
last_updated: "2026-07-13"
tags: ["getting-started", "install", "scaffold"]
section: "Getting Started"
sectionOrder: 1
order: 1
---

# Getting Started

Zenith is a compiler-first framework for `.zen` pages, layouts, and components. Start with the public scaffold so the package versions, route tree, and build scripts begin in a known state.

## Requirements

Install a supported Node.js release and npm. Zenith's compiler and bundler also require one of the native platforms listed in [Install and Compatibility](/docs/install-compatibility).

## Create a Project

```bash
npm create zenith@latest my-app
cd my-app
npm install
npm run dev
```

The scaffold prompts for a starter and optional tooling. Choose the Tailwind starter when you want the repository's current Tailwind v4 setup.

## Open the Site

The development command prints the local URL. Open that URL and edit `src/pages/index.zen`; the page is the `/` route.

## What the Scaffold Creates

The generated project includes:

- `src/pages/` for file-based routes
- `src/layouts/` for shared document structure
- `src/public/` for public assets
- `src/styles/` for the local style entry
- `zenith.config.js` for the pages directory and build target
- package scripts for development, build, preview, and tests

## Where to Go Next

Continue with [Project Structure](/docs/getting-started/project-structure), then build [Your First Page](/docs/getting-started/first-page).
