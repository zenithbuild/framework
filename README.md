# Zenithbuild Framework

Zenithbuild Framework is the Zenith core monorepo for the compiler, bundler, runtime, router, CLI, core package, `create-zenith`, docs, and monorepo apps.

The core packages are TS-authored, ship JS from `dist/`, and publish `dist/*.d.ts` for consumers.

Start with [`./docs/README.md`](./docs/README.md).

## What Lives Here
- `packages/` for core packages: compiler, bundler, runtime, router, CLI, core, and `create-zenith`
- `docs/` for canonical documentation and release notes
- `apps/` for monorepo apps and smoke fixtures
- `governance/` and `contracts/` for repo rules and canonical contracts

## What Stays Separate
- Plugins live in separate repositories.
- `zenith-language` and `zenith-language-server` remain separate repositories.
- `site` is a separate public deployable app boundary for the marketing site, docs, blog, changelog, and Vercel surface.
- `zenith-cms` is a separate private deployable app boundary for the Directus editorial workspace and Render deployment surface.
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

## Support Zenith

Zenith is an open source project built around compiler-first UI, deterministic output, explicit contracts, and minimal runtime behavior.

If you use Zenith in your work or want to support its continued development, consider sponsoring the project on GitHub: [Sponsor Zenith](https://github.com/sponsors/zenithbuild). Sponsorship helps fund core engineering, tooling, documentation, and long-term maintenance.

A limited number of design partner and implementation/advisory relationships are also available for teams exploring Zenith seriously.
