#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Keep audit failure status while exercising the rest of core for useful evidence.
audit_status=0
node ./scripts/security/check-dependency-advisories.mjs || audit_status=$?

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
node --test scripts/verify-platform-binary-smoke.spec.mjs
node --test scripts/workflow-trust-boundary.spec.mjs
node --test scripts/check-toolchain.spec.mjs scripts/toolchain-ci-contract.spec.mjs
node --test scripts/security/dependency-audit-report.spec.mjs scripts/security/check-dependency-advisories.spec.mjs
node --test scripts/file-size-audit.spec.mjs
node --test scripts/live-hosted-adapter-smoke.spec.mjs
node --test apps/integration-tests/scripts/*.spec.mjs

cargo test --manifest-path packages/compiler/Cargo.toml
cargo test --manifest-path packages/bundler/Cargo.toml

# Bundler node/js contract tests
bun run --cwd packages/bundler contract:deps
bun run --cwd packages/bundler contract:scan
bun run --cwd packages/bundler contract:imports

# Compiler node/js bridge tests
node --test packages/compiler/tests/*.spec.js

# set -e means reaching this point proves every other core check passed.
if [ "$audit_status" -ne 0 ]; then
  if [ "$audit_status" -eq 2 ]; then
    reason="the dependency audit could not run (tool, registry or schema error), not an advisory finding"
  else
    reason="active dependency advisories remain (disposition: JUD-21)"
  fi
  echo "[ci-core] RED: all other core checks passed; exiting $audit_status only because ${reason}. See the [dependency-audit] lines near the top of this log." >&2
fi
exit "$audit_status"
