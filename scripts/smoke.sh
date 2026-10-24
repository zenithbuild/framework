#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SMOKE_PORT="${ZENITH_SMOKE_PORT:-$(node -e "const net = require('node:net'); const server = net.createServer(); server.listen(0, '127.0.0.1', () => { process.stdout.write(String(server.address().port)); server.close(); });")}"

node scripts/smoke-cross-os.mjs
ZENITH_COMPILER_BIN="$ROOT/packages/compiler/target/release/zenith-compiler" \
ZENITH_BUNDLER_BIN="$ROOT/packages/bundler/target/release/zenith-bundler" \
ZENITH_SMOKE_PORT="$SMOKE_PORT" \
  bun run --cwd apps/smoke-test smoke
