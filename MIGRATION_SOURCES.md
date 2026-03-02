# Migration Sources

This file records the source repository or workspace snapshot used for each monorepo import.

## Core Packages

| Target | Source repo | Import method | Ref | Commit SHA |
| --- | --- | --- | --- | --- |
| `packages/cli` | `https://github.com/zenithbuild/zenith-cli.git` | `git subtree add` | `v0.6.5` | `c5780120596263853a78b49a3cd83bc97ee7fb44` |
| `packages/core` | `https://github.com/zenithbuild/zenithbuild-core.git` | `git subtree add` | `v0.6.5` | `43b3451a9e9c5e3e374c2032ccf60d8a38e37b2b` |
| `packages/compiler` | `git@github.com:zenithbuild/zenith-compiler.git` | `git subtree add` | `v0.6.5` | `f1e8ab5b352fa09de733fd257af73bb608dc12f3` |
| `packages/bundler` | `git@github.com:zenithbuild/zenith-bundler.git` | `git subtree add` | `v0.6.5` | `359bd4386d06d1ad4463a6bcf7391af3b0bb72d3` |
| `packages/runtime` | `git@github.com:zenithbuild/zenith-runtime.git` | `git subtree add` | `v0.6.5` | `c227cd7f519318551079bdd3cbcca9e2e463b88a` |
| `packages/router` | `git@github.com:zenithbuild/zenith-router.git` | `git subtree add` | `v0.6.5` | `1f6427e4ab28f7a08cfc799eda4b01aa84ed635f` |
| `packages/create-zenith` | `https://github.com/zenithbuild/create-zenith.git` | `git subtree add` | `v0.6.5` | `cbeeb7705daec2397d76e0c49e3e9f04c20db6a0` |
| `packages/docs` | `git@github.com:zenithbuild/zenith-docs.git` | `git subtree add` | `v0.6.5` | `a81e28b9ad8cac9876dd0e84bc68250b633e9c61` |

## Apps

These app sources are local workspace directories, not standalone git repositories in the current source workspace. They will be copied as stable local snapshots during migration.

| Target | Source path | Import method | Ref | Commit SHA |
| --- | --- | --- | --- | --- |
| `apps/smoke-test` | `/Users/judahsullivan/Personal/zenith/smoke-test` | direct copy snapshot | `workspace-snapshot` | `n/a` |
| `apps/integration-tests` | `/Users/judahsullivan/Personal/zenith/integration-tests` | direct copy snapshot | `workspace-snapshot` | `n/a` |
