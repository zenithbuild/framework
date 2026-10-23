# create-zenith ⚡

The official CLI for scaffolding new Zenith applications. Fast, animated, and delightful.

## Canonical Docs

- Create contract: `../../docs/documentation/contracts/create-contract.md`
- Deployment targets guide: `../../docs/documentation/guides/deployment-targets.md`
- Install and compatibility: `../../docs/documentation/install-compatibility.md`

## Overview

`create-zenith` is the entry point to the Zenith ecosystem. It provides a signature, high-quality terminal experience for initializing new projects, ensuring you go from command line to `localhost` in seconds with confidence.

## Features

- **Animated Logo**: A branded, progressive gradient reveal that sets the tone for the framework.
- **Interactive UX**: Built with `@clack/prompts` for intuitive arrow-key navigation and clear visual indicators.
- **Reliable Fallbacks**: Automatically detects CI environments and non-TTY pipes to provide clean, static output.
- **Smart Detection**: automatically detects your preferred package manager (Bun, pnpm, Yarn, or npm).
- **Template Authority**: Scaffold generation now reads only from `templates/` (`basic`, `css`, `tailwind`), which is the single source of truth for starter projects.
- **Tool-Agnostic Output**: ESLint and Prettier are opt-in. If you answer `No`, the generated project contains no scripts, dependencies, config files, or ignore files for that tool.

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

## Optional Tooling Contract

During scaffold, `create-zenith` asks whether to include:

- ESLint
- Prettier

Tooling behavior is strict:

- If you enable ESLint, the project gets `eslint.config.js`, lint scripts, and matching ESLint dependencies.
- If you disable ESLint, the project contains zero ESLint references.
- If you enable Prettier, the project gets `.prettierrc`, `.prettierignore`, a format script, and the Prettier dependency.
- If you disable Prettier, the project contains zero Prettier references.

## Current Release Notes
- Generated apps now depend on `@zenithbuild/core@latest` so new installs track the current stable framework release.
- Template downloads now resolve from `zenithbuild/framework`, which is the active monorepo source of truth.
- Starter templates now live under `templates/`, and the scaffolder no longer depends on `examples/`.
- ESLint and Prettier are now feature overlays, so opting out leaves no stray config or dependency references in the scaffolded app.
- Verified scaffold → install → build coverage lives in `tests/template-regression.spec.mjs`.

## Templates vs Examples

- `templates/` is authoritative for scaffolding.
- `examples/` is demo-only when present and is not part of the scaffold source of truth.

## Deployment Defaults

Generated templates currently ship with this Zenith baseline:

- `pagesDir: 'src/pages'`
- `target: 'static'`
- `typescriptDefault: true`

The basic template also keeps `router: false` explicit to preserve the single-page baseline.

Supported deployment targets in the framework today are:

- `static`
- `vercel-static`
- `netlify-static`
- `vercel`
- `netlify`
- `node`

`npm run preview` is target-aware. It previews the built target contract for the generated app instead of always acting like a generic static file server.

For the full target matrix, emitted output shapes, and current limitations, see `../../docs/documentation/guides/deployment-targets.md`.

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
