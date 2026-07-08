# create-zenith v1.3.21

## [1.3.21] - 2026-07-08

### Added

- New Zenith apps now include root `AGENTS.md`.
- New Zenith apps now include project-local `.agents/skills/zenith` rules and examples by default.
- The scaffolded skill mirrors `skills/zenithbuild` to improve AI/agent support out of the box.

### Verification

- Confirmed the package tarball includes `templates/features/agents/**`.
- Added scaffold tests that enforce required agent files, guard/load export shape, drift patterns, file size limits, and canonical skill sync.
- Known local validation limitation: full `template-regression` build-smoke currently fails because this local environment cannot resolve/build `@zenithbuild/bundler`; rebuilding the bundler requires Cargo, which is unavailable here. Non-bundler scaffold and agent-skill validations pass.

## Installation

```bash
bun add create-zenith@1.3.21
```

or with npm:

```bash
npm install create-zenith@1.3.21
```
