#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node scripts/smoke-cross-os.mjs
ZENITH_COMPILER_BIN="$ROOT/packages/compiler/target/release/zenith-compiler" \
ZENITH_BUNDLER_BIN="$ROOT/packages/bundler/target/release/zenith-bundler" \
  bun run --cwd apps/smoke-test smoke
