<!-- LEGACY NOTE: This reflects the old repo layout and publish flow. Paths and steps may not apply to this shell repo. -->

# Zenith Beta Publish Plan (v0.5.0-beta.2)

Date: 2026-02-24

Status snapshot (working tree):

- Blocker 1 fixed locally: publish-surface package versions updated to `0.5.0-beta.2`.
- Blocker 3 fixed locally: `@zenithbuild/runtime` export now targets `dist`.
- Blocker 4 fixed locally: bulk publish scripts now only target the beta public surface.
- Remaining: blocker 2 governance (`zenith-cli` tag ancestry) plus per-repo commit/tag/push.

## Intended Public Surface

Publish for beta:

1. `@zenithbuild/core` (repo: `zenith-core`)
2. `create-zenith` (repo: `create-zenith`)
3. `@zenithbuild/language-server` (repo: `zenith-language-server`)
4. `@zenithbuild/language` (repo: `zenith-language`)

Do not publish as public beta install surface:

1. `@zenithbuild/compiler` (`zenith-compiler`)
2. `@zenithbuild/runtime` (`zenith-runtime`)
3. `@zenithbuild/router` (`zenith-router`)
4. `@zenithbuild/bundler` (`zenith-bundler`)
5. `@zenithbuild/cli` (`zenith-cli`)

## Gate Check Results

## 1) Tag ancestry / governance

`v0.5.0-beta.2` branch containment:

- `zenith-core`: `main` (pass)
- `create-zenith`: `main` (pass)
- `zenith-language-server`: `main` (pass)
- `zenith-language`: `main` (pass)
- `zenith-cli`: `codex/compiler-bridge` only (fail)

Blocking issue:

- `zenith-cli` tag `v0.5.0-beta.2` is not on `main`.

## 2) Version alignment for beta.2

Current package versions:

- `@zenithbuild/core`: `0.5.0-beta.2` (`zenith-core/package.json`)
- `create-zenith`: `0.5.0-beta.2` (`create-zenith/package.json`)
- `@zenithbuild/language-server`: `0.5.0-beta.2` (`zenith-language-server/package.json`)
- `@zenithbuild/language`: `0.5.0-beta.2` (`zenith-language/package.json`)

Blocking issue:

- Existing `v0.5.0-beta.2` tags in these repos still point to earlier commits; create new release tags after committing these version bumps.

## 3) Install story

Template dependency surface is clean:

- `create-zenith/examples/starter/package.json` depends only on `@zenithbuild/core`.
- `create-zenith/examples/starter-tailwindcss/package.json` depends only on `@zenithbuild/core`.

Required follow-up:

- Template dependency version should be updated from `0.5.0-beta.1` to the intended beta version.

## 4) Boundary / packaging checks

Findings:

- `zenith-runtime/package.json` export mismatch was fixed locally (`exports` now targets `dist`).
- `zenith-language-server` and `zenith-language` have no `files` whitelist and currently publish source-heavy tarballs by default.
- Root publish scripts were narrowed locally to the public beta surface only.

## 5) Pinning check

`@zenithbuild/core` currently pins internals exactly (no caret), which is correct policy, but still at `0.5.0-beta.1`:

- `@zenithbuild/cli`: `0.5.0-beta.1`
- `@zenithbuild/compiler`: `0.5.0-beta.1`
- `@zenithbuild/runtime`: `0.5.0-beta.1`
- `@zenithbuild/router`: `0.5.0-beta.1`
- `@zenithbuild/bundler`: `0.5.0-beta.1`

## Blockers Before Publish

1. Resolve `zenith-cli` tag governance (`v0.5.0-beta.2` currently not on `main`).
2. Commit and push the local package/script fixes across the affected repos.
3. Create new immutable release tags for corrected commits (recommended: `v0.5.0-beta.2.19`).

## Tag-Based Publish Commands (After Blockers Cleared)

Run from `(legacy workspace path removed)`.

Use a writable npm cache (workaround for local cache ownership issue):

```bash
export NPM_CONFIG_CACHE=/tmp/.npm-cache
mkdir -p "$NPM_CONFIG_CACHE"
```

Publish each package from a detached `v0.5.0-beta.2` tag checkout:

```bash
# 1) @zenithbuild/core
git -C zenith-core checkout --detach v0.5.0-beta.2
(cd zenith-core && npm ci && npm test && npm publish --tag beta --access public)

# 2) create-zenith
git -C create-zenith checkout --detach v0.5.0-beta.2
(cd create-zenith && npm ci && npm run build && npm publish --tag beta --access public)

# 3) @zenithbuild/language-server
git -C zenith-language-server checkout --detach v0.5.0-beta.2
(cd zenith-language-server && npm ci && npm run build && npm publish --tag beta --access public)

# 4) @zenithbuild/language
git -C zenith-language checkout --detach v0.5.0-beta.2
(cd zenith-language && npm ci && npm run build:marketplace && npm publish --tag beta --access public)
```

Return repos to branch tip after publish:

```bash
git -C zenith-core checkout main
git -C create-zenith checkout main
git -C zenith-language-server checkout main
git -C zenith-language checkout main
```

## Optional Hardening

1. Add per-repo release gate requiring:
   - clean tree
   - branch is `main` (or explicit `release/*`)
   - `HEAD == tag commit`
2. Add `files`/`exports` hardening for language packages.
3. Add README banner to internal packages: `Internal implementation. Not public API.`
