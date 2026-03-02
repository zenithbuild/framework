# create-zenith ⚡

The official CLI for scaffolding new Zenith applications. Fast, animated, and delightful.

## Canonical Docs

- Create contract: `../zenith-docs/documentation/contracts/create-contract.md`
- Install and compatibility: `../zenith-docs/documentation/install-compatibility.md`

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

## Latest Release (Beta 2.13)

- **Fixed:** `zenith --help` now exits 0 reliably (bin wrapper early-exit before version-mismatch checks)
- **Published:** Leaf packages at `0.5.0-beta.2.20`; `@zenithbuild/core` and `create-zenith` at `0.5.0-beta.2.20`
- **Verified:** scaffold → install → `--version` → `--help` → build → all routes output static HTML (`/`, `/about`, `/blog`, `/docs`)

## Development

```bash
# Clone the repository
git clone https://github.com/zenithbuild/create-zenith.git

# Install dependencies
bun install

# Build the CLI
bun run build

# Test locally
bun run create my-test-app
```

## License

MIT
