# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.7] - 2026-02-05

### 🐛 Bug Fixes

- ****compiler**: solve 'all is not a function' by correctly wrapping event handlers** (1856b93)
  > - Correctly wrap complex event handler expressions (e.g., onload) in arrow functions
  > - Implement recursive template scanning for event handlers (has_events)
  > - Hardened SSG/SPA builds with unified style output (string instead of array)
  > - Cleanup dead code and unused imports in native compiler
  > - Bmp version to 1.3.6 and 0.1.1 (native)

### 🔨 Chores

- **release v1.3.5** (3491406)

### 📝 Other Changes

- **
d3d64d04ecf430ee1063306f7e9457ec6307024d** ()
  > chore: release v1.3.2
- **
ecf6654cbab8c5c8333d877c7fde30b5fdb2c137** ()
  > chore: release v1.3.1
- **
80db1e313603e949049eba026899276d68429eac** ()
  > fix(deps): wire up dependencies for unified core architecture
- **
b0fefa2e971ca797b798cf1e337b67fc456a1a5b** ()
  > feat(dev-server): implement Phase 6 - Zero-Copy Dev Server Integration|Implement a high-performance, in-memory development server architecture for the Zenith Framework.
  > 
  > - Phase 6 integration of Dev Server and AssetStore.
  > - NAPI Controller and HMR loop implementation.
  > - Workspace-wide alignment for Phase 6 completion.
- **1.0.15** (e0697e3)
- **
ae6babc57024b179d4a1fd268de2cb1d15127ed5** ()
  > fix: pin internal dependencies and stabilize build
- **
bfd6d4876210c7880d60b28c674a573fe4a66ce5** ()
  > fix(compiler): strip HTML comments from expressions to prevent parse errors
- **
40e21496b9b7af7785f2cbbb4079466c7f6cbe24** ()
  > chore(release): bump version [skip ci]
- **
b9b733a88f616284038a187f6780b6fc29f20bcc** ()
  > chore(release): improve release notes legibility and synchronize workflows
- **
9b4a923156c3249bab9605cfd311149415a979b2** ()
  > chore: bump version to 1.0.13
- **
db7231181efdd02dc557af20183779d94fea99ab** ()
  > chore: include all pending changes for v1.0.12 release
- **
dfb8d19e4c2900aff665c97dbd75bf877f0dbda6** ()
  > chore: release @zenithbuild/compiler v1.0.12
- **
d21f5ea204551b58b257812c908b65949ce0d2c8** ()
  > chore: align branding and dependencies for v1.0.1 release
- **
4c9c5c3cfd4989480797cf41ce786bfe7d17fa50** ()
  > feat: release v1.0.1 - The Iron Heart (Coordinated Compiler Release)|- Adopt 'Iron Heart' architecture: validation and wiring owned at compile time
  > 
  > - Integrate dynamic runtime synchronization with @zenith/core
  > 
  > - Unify branding under @zenith/compiler
- **first commit** (0b936c4)
- **** ()

## [1.0.14] - 2026-01-26

### 🔨 Chores

- ****release**: improve release notes legibility and synchronize workflows** (b9b733a)

### 📝 Other Changes

- **** ()

