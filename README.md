# Zenithbuild Framework

Zenithbuild Framework is the Zenith core monorepo for the compiler, bundler, runtime, router, CLI, core package, `create-zenith`, docs, and monorepo apps.

Start with [`./docs/README.md`](./docs/README.md).

## What Lives Here
- `packages/` for core packages: compiler, bundler, runtime, router, CLI, core, and `create-zenith`
- `docs/` for canonical documentation and release notes
- `apps/` for monorepo apps and smoke fixtures
- `governance/` and `contracts/` for repo rules and canonical contracts

## What Stays Separate
- Plugins live in separate repositories.
- `zenith-language` and `zenith-language-server` remain separate repositories.
- Imported source refs are tracked in [`./MIGRATION_SOURCES.md`](./MIGRATION_SOURCES.md).

## Repository Settings
Maintainers should update the GitHub About description to:

> Zenith core monorepo: compiler, bundler, runtime, router, CLI, docs, and apps. Plugins live in separate repos.

Topics to add:
- `zenith`
- `compiler`
- `ui-framework`
- `rust`
- `typescript`
