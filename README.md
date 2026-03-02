# Zenithbuild Framework

This repository is the Zenithbuild core framework monorepo. Governance and canonical contracts stay at the root, while core packages and apps live under workspaces for local development and a single CI gate.

Key entrypoints:
- Governance: [`./governance/AGENTS.md`](./governance/AGENTS.md)
- Contracts: [`./contracts/`](./contracts/)
- Source manifest: [`./MIGRATION_SOURCES.md`](./MIGRATION_SOURCES.md)

## Layout
- `packages/` contains imported core packages.
- `apps/` contains non-published apps and smoke fixtures.
- `scripts/` contains repository-level build and CI entrypoints.

## Current Policy
- Source repos outside this monorepo remain authoritative until the monorepo train is stable.
- Plugins remain separate and are not imported here.
- Language tooling remains separate for now.
- Core package versions are lockstep via [`./TRAIN_VERSION`](./TRAIN_VERSION).
