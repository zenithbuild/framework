# Release Policy

This document records the stable dist-tag policy for the core Zenith framework packages.

Core packages are TS-authored and JS-shipped: the source of truth is TypeScript, while published consumers continue to receive JS from `dist/` plus declaration files.

## Dist tags

- `latest` is the stable default for `@zenithbuild/core` and `@zenithbuild/cli`.
- `train` exists only as a staging channel when we need one.
- `beta` remains the prerelease channel.

## Promotion sequence

After a stable train publish completes:

1. Promote `@zenithbuild/core@TRAIN_VERSION` to `latest`.
2. Promote `@zenithbuild/cli@TRAIN_VERSION` to `latest`.
3. Promote the rest of `@zenithbuild/*` packages to `latest` only after cross-OS native binary packaging is fixed.

## Package roles

- `@zenithbuild/core` remains the anchor package.
- Internal packages are not a user-facing install surface even if they eventually align on `latest`.

## Current blocker

Full-package `latest` promotion is not unconditional yet. Native compiler and bundler distribution still needs platform-correct packaging before the ecosystem can assume every install path is cross-OS safe without fallback.
