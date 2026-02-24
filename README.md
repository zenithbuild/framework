# @zenithbuild/cli ⚡

> **⚠️ Internal API:** This package is an internal implementation detail of the Zenith framework. It is not intended for public use and its API may break without warning. Please use `@zenithbuild/core` instead.


The command-line interface for developing and building Zenith applications.

## Overview

`@zenithbuild/cli` provides the toolchain needed to manage Zenith projects. While `create-zenith` is for scaffolding, this CLI is for the daily development loop: serving apps, building for production, and managing plugins.

## Features

- **Dev Server**: Instant HMR (Hot Module Replacement) powered by Bun.
- **Build System**: optimized production bundling.
- **Plugin Management**: Easily add and remove Zenith plugins.
- **Preview**: Test your production builds locally.

## Commands

### `zenith dev`
Starts the development server on `localhost:3000`.

### `zenith build`
Compiles and bundles your application for production.

### `zenith preview`
Serves the locally built application for verification.

### `zenith add <plugin>`
Installs and configures a Zenith plugin.

## Installation

Typically installed as a dev dependency in your Zenith project:

```bash
bun add -d @zenithbuild/cli
```

## License

MIT
