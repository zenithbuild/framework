#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash ./scripts/build.sh
node ./scripts/verify-compiler-shipped-surface.mjs
node ./scripts/verify-publish-surface.mjs --selection release
node ./scripts/verify-publish-surface.mjs --selection scaffolder

bun run --cwd packages/runtime typecheck
bun run --cwd packages/router typecheck
bun run --cwd packages/cli typecheck
bun run --cwd packages/language-server typecheck
bun run --cwd packages/language typecheck

# Pin workspace binaries for deployment smoke and CLI tests.
# Without this, toolchain-paths.ts may resolve stale npm-installed binaries
# instead of the freshly built workspace ones.
# Inline (not exported) so toolchain-cross-os tests still exercise normal resolution.
ZENITH_COMPILER_BIN="$ROOT/packages/compiler/target/release/zenith-compiler" \
ZENITH_BUNDLER_BIN="$ROOT/packages/bundler/target/release/zenith-bundler" \
  bun run --cwd packages/cli test:deployment-smoke
ZENITH_COMPILER_BIN="$ROOT/packages/compiler/target/release/zenith-compiler" \
ZENITH_BUNDLER_BIN="$ROOT/packages/bundler/target/release/zenith-bundler" \
  bun run --cwd packages/cli test
bun run --cwd packages/core test
bun run --cwd packages/runtime test
bun run --cwd packages/router test
bun run --cwd packages/create-zenith test
bun run --cwd packages/language-server test
bun run --cwd packages/language test
bun run --cwd docs docs:gate
node --test scripts/assert-tag-on-branch.spec.mjs
node --test scripts/verify-publish-surface.spec.mjs
node --test scripts/publish-packages-bootstrap.spec.mjs
node --test scripts/publish-packages-existing-package.spec.mjs
node --test scripts/bootstrap-platform-package.spec.mjs

cargo test --manifest-path packages/compiler/Cargo.toml
cargo test --manifest-path packages/bundler/Cargo.toml

# Bundler node/js contract tests
bun run --cwd packages/bundler contract:deps
bun run --cwd packages/bundler contract:scan
bun run --cwd packages/bundler contract:imports

# Compiler node/js bridge tests
node --test packages/compiler/tests/*.spec.js

# Integration Matrix
bun run --cwd apps/integration-tests test:ci

bash ./scripts/smoke.sh
