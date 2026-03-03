#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bun run --cwd packages/runtime build
bun run --cwd packages/router build
bun run --cwd packages/cli build
bun run --cwd packages/create-zenith build

cargo build --release --manifest-path packages/compiler/Cargo.toml
bun run --cwd packages/bundler build

bun run --cwd docs docs:gate
bun run --cwd apps/smoke-test build
