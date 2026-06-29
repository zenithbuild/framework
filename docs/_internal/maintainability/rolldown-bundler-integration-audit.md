# Rolldown Bundler Integration Audit

Date: 2026-06-29

Issue: #107, "Audit Rolldown Rust crate availability and Zenith bundler integration path"

## 1. Summary

Rolldown is already integrated into Zenith through the public library bundling
path and as targeted vendor-bundling infrastructure. The active bundler still
owns Zenith-specific output behavior: compiler IR validation, hydration
payload/bootstrap generation, router and non-router entry generation, runtime
asset handling, and native package release behavior.

This audit does not recommend replacing the Zenith bundler with Rolldown, adding
an adapter/backend layer, or moving dependencies in this batch. The safe outcome
for #107 is to record the current state and defer any dependency movement to a
separate prototype.

## 2. External Availability

Official sources verified on 2026-06-29:

- `rolldown` is published on crates.io.
- `rolldown_common` is published on crates.io.
- `rolldown_plugin` is published on crates.io.
- Current verified crates.io version for all three crates: `1.1.3`.
- License: MIT.
- Latest checked GitHub release: `v1.1.3`, published 2026-06-24.

This audit does not prove that crates.io `1.1.3` is API-compatible with
Zenith's current git-pinned Rolldown integration.

## 3. Current Zenith Integration

Zenith currently depends on Rolldown through git dependencies in
`packages/bundler/Cargo.toml`:

- `rolldown`
- `rolldown_common`
- `rolldown_plugin`

`packages/bundler/Cargo.lock` pins the Rolldown packages to git commit
`67a1f5887b5752fe6975bdae1c3b5d4ff30bf7f2`.

`packages/bundler/src/utils.rs` also pins the expected commit prefix:

```rust
pub const EXPECTED_ROLLDOWN_COMMIT: &str = "67a1f58";
```

`packages/bundler/src/lib.rs` exposes `bundle_page()`, which delegates to
`packages/bundler/src/bundle.rs`. That path constructs `ZenithLoader`, wires it
into Rolldown through `BundlerBuilder`, and uses Rolldown for graph resolution
and chunk emission in the library API.

`packages/bundler/src/vendor.rs` separately uses Rolldown directly for vendor
bundling:

- collects external package specifiers from compiler/bundler IR,
- rejects framework interop packages that require an adapter/islands layer,
- builds a virtual vendor entry,
- invokes Rolldown with browser ESM output options,
- writes deterministic vendor assets,
- includes the Rolldown commit pin in vendor cache/hash seeds.

The current Rolldown usage is scoped. Zenith-owned code still generates
hydration payload tables and bootstrap code in
`packages/bundler/src/bundler_page_entry.rs`. Rolldown does not own Zenith's
hydration payload contract, router entry generation, runtime contracts, or
server output contracts.

## 4. Non-goals

This batch must not:

- change `Cargo.toml` or `Cargo.lock`,
- switch to crates.io `rolldown = 1.1.3`,
- add a new Rolldown dependency,
- replace the active Zenith bundler,
- add an optional backend, adapter, or plugin layer,
- change compiler, runtime, router, or CLI behavior,
- change native binary or package distribution behavior.

## 5. Integration Options Considered

### Direct Replacement

Not recommended. Zenith's bundler is not only a generic JavaScript bundler. It
validates compiler IR, emits hydration bootstrap payloads, manages router and
non-router output shape, handles runtime/core assets, writes manifests, and
participates in native package publishing.

### Optional Backend

Deferred. Zenith already uses Rolldown where it currently fits: the public
`bundle_page()`/`ZenithLoader` path and vendor bundling. Adding a backend
selection layer would expand architecture surface without current proof that it
lowers risk.

### Future Adapter Layer

Deferred. Adapter or plugin expansion is outside #107 and should not be coupled
to a dependency audit.

### Crates.io Dependency Normalization

Potential future prototype only. A later branch may test replacing the
git-pinned Rolldown crates with crates.io `1.1.3`, but only behind full
`bundle_page()`/`ZenithLoader` and vendor-output parity checks and without
changing public output contracts.

## 6. Risks

- Rolldown crate APIs may have changed between the current git-pinned commit and
  crates.io `1.1.3`.
- Updating Rolldown could change vendor bundle output and asset hashes.
- The current vendor cache/hash seed includes `EXPECTED_ROLLDOWN_COMMIT`; a
  crates.io-based dependency path needs an explicit deterministic replacement.
- Lockfile churn could pull in new OXC/Rolldown dependency versions.
- Native bundler binary size and platform-package reproducibility could change.
- Router/runtime/server-output tests may observe indirect output drift because
  Rolldown participates in both the public `bundle_page()`/`ZenithLoader` path
  and vendor bundling.

## 7. Recommendation

Close #107 with this audit note after the PR merges.

Do not switch to crates.io `1.1.3` in this batch. Do not change the current
git-pinned Rolldown integration. Do not treat Rolldown as a full bundler
replacement for Zenith.

The next safe action, if any, is a separate prototype issue that tests
dependency normalization only.

## 8. Follow-up Issue Suggestion

Suggested title:

```text
prototype: test Rolldown crates.io dependency normalization
```

Suggested scope:

- Try replacing the git-pinned `rolldown`, `rolldown_common`, and
  `rolldown_plugin` dependencies with crates.io `1.1.3`.
- Preserve current Zenith bundler behavior.
- Update no public contracts unless a separate implementation plan approves it.
- Compare `bundle_page()` library output through `ZenithLoader`, vendor output,
  manifest output, router/non-router output, server output, native binary
  behavior, and package smoke results.
- Merge only if parity gates pass and the deterministic cache/hash strategy is
  explicitly updated or preserved.

## 9. Validation

For this docs-only audit note:

```bash
git diff --check
node ./scripts/file-size-audit.mjs \
  --allowlist docs/maintainability/file-size-allowlist.json \
  --enforce \
  --max-lines 500 \
  --git-diff-base origin/master \
  --print-limit 120
```

For any future dependency prototype:

```bash
cargo test --manifest-path packages/bundler/Cargo.toml
cargo build --manifest-path packages/bundler/Cargo.toml --locked
bun run --cwd packages/cli test
node ./scripts/file-size-audit.mjs \
  --allowlist docs/maintainability/file-size-allowlist.json \
  --enforce \
  --max-lines 500 \
  --git-diff-base origin/master \
  --print-limit 120
```
