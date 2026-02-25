# Install & Compatibility

## Quick Install

```bash
# npm
npx create-zenith@beta my-app

# npm create shorthand
npm create zenith@beta my-app

# Bun
bunx create-zenith@beta my-app
```

Then:

```bash
cd my-app
npm install
npx zenith build
```

## Current Beta Train

| Package | Version | Role |
|---------|---------|------|
| `@zenithbuild/core` | `0.5.0-beta.2.13` | CLI binary, config, IR schema |
| `@zenithbuild/compiler` | `0.5.0-beta.2.12` | `.zen` → IR compiler |
| `@zenithbuild/cli` | `0.5.0-beta.2.12` | Build orchestrator |
| `@zenithbuild/runtime` | `0.5.0-beta.2.12` | Hydration, signals, effects |
| `@zenithbuild/router` | `0.5.0-beta.2.12` | File-based router + ZenLink |
| `@zenithbuild/bundler` | `0.5.0-beta.2.12` | Asset bundling, dev server |
| `create-zenith` | `0.5.0-beta.2.13` | Project scaffolding |

### Why core is `.13` and leaf packages are `.12`

Core contains the `bin/zenith.js` wrapper—the CLI entry point users invoke directly. It bumped to `.13` to patch `--help` early-exit behavior without touching the engine. The leaf packages (compiler, cli, runtime, router, bundler) are the engine and remain at `.12`.

This is intentional. Core may bump independently for CLI or bin fixes; leaf packages bump together when the engine changes.

### Guarantee

If `npx create-zenith@beta` scaffolds, installs, and `zenith build` exits 0 in a clean directory with no lockfile — the beta is supported.

### Version Mismatch

If you hit mismatched internal versions, delete `node_modules` and `package-lock.json`, then reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

The `bin/zenith.js` wrapper performs a version-mismatch check on startup and will warn you if internal packages are skewed.
