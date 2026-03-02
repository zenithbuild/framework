# Contributing

This repository now contains the Zenithbuild core monorepo train. Governance and contracts stay canonical at the root, and imported core packages/apps live under `packages/` and `apps/`.

## Current Expectations
- Keep governance and contract updates aligned with implementation changes.
- Preserve package names and lockstep train policy unless a repo-level versioning decision is made.
- Keep plugins and language tooling out of this repository for now.
- Keep CI unified through the single root gate.

## Not In Scope
- Publishing automation changes beyond local workspace wiring.
- Importing plugin repositories.
- Importing `zenith-language` or `zenith-language-server`.
- Rewriting source repos outside this monorepo as part of monorepo-only fixes.
