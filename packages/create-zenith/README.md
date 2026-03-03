# create-zenith ⚡

The official CLI for scaffolding new Zenith applications. Fast, animated, and delightful.

## Canonical Docs

- Create contract: `framework/docs`
- Install and compatibility: `framework/docs`

## Overview

`create-zenith` is the entry point to the Zenith ecosystem. It provides a signature, high-quality terminal experience for initializing new projects, ensuring you go from command line to `localhost` in seconds with confidence.

## Features

- **Animated Logo**: A branded, progressive gradient reveal that sets the tone for the framework.
- **Interactive UX**: Built with `@clack/prompts` for intuitive arrow-key navigation and clear visual indicators.
- **Reliable Fallbacks**: Automatically detects CI environments and non-TTY pipes to provide clean, static output.
- **Smart Detection**: automatically detects your preferred package manager (Bun, pnpm, Yarn, or npm).
- **Batteries Included**: Optional setup for ESLint, Prettier, and TypeScript path aliases.

## Quick Start

```bash
# Using npm
npm create zenith@latest

# Using Bun (Recommended)
bun create zenith

# Using pnpm
pnpm create zenith
```

## Options

| Flag | Description |
|------|-------------|
| `[project-name]` | The name of your new project and directory |
| `-h, --help` | Show usage information |
| `-v, --version` | Show version number |

## Beta Version Pinning

Zenith beta currently pins `@zenithbuild/core` to `0.5.0-beta.2.20` and leaf packages (compiler, cli, runtime, router, bundler) to `0.5.0-beta.2.20`. This is intentional — core contains the CLI entry point and may bump independently for bin/CLI fixes without touching the engine.

If you see version mismatches after install, delete `node_modules` and `package-lock.json`, then reinstall.

## Latest Release

- Generated apps now depend on `@zenithbuild/core@latest` so new installs track the current stable framework release.
- Template downloads now resolve from `zenithbuild/framework`, which is the active monorepo source of truth.
- Verified scaffold → install → build coverage lives in `tests/template-regression.spec.mjs`.

## Development

```bash
# Clone the monorepo
git clone https://github.com/zenithbuild/framework.git

# Enter the package
cd framework/packages/create-zenith

# Install dependencies
bun install

# Build the CLI
bun run build

# Test locally
bun run create my-test-app
```

## License

MIT
