#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash ./scripts/build.sh

bun run --cwd packages/cli test
bun run --cwd packages/core test
bun run --cwd packages/runtime test
bun run --cwd packages/router test
bun run --cwd packages/create-zenith test
bun run --cwd packages/docs docs:gate

cargo test --manifest-path packages/compiler/Cargo.toml
cargo test --manifest-path packages/bundler/Cargo.toml

bash ./scripts/smoke.sh
