#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Zenith Vercel Build ==="
echo "ROOT: $ROOT"
echo "Node: $(node --version)"
echo "Bun:  $(bun --version)"

# ── Step 1: Ensure Rust toolchain ────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  echo "=== Installing Rust toolchain ==="
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  source "$HOME/.cargo/env"
fi
echo "Cargo: $(cargo --version)"

# ── Step 2: Build Rust binaries (compiler + bundler) ─────────────────────────
echo "=== Building Rust binaries ==="
cargo build --release --manifest-path packages/compiler/Cargo.toml
cargo build --release --manifest-path packages/bundler/Cargo.toml

COMPILER_BIN="$ROOT/packages/compiler/target/release/zenith-compiler"
BUNDLER_BIN="$ROOT/packages/bundler/target/release/zenith-bundler"

echo "Compiler: $COMPILER_BIN ($($COMPILER_BIN --version))"
echo "Bundler:  $BUNDLER_BIN ($($BUNDLER_BIN --version))"

# ── Step 3: Build workspace TS packages ──────────────────────────────────────
echo "=== Building workspace TS packages ==="
bun run --cwd packages/runtime build
bun run --cwd packages/router build
bun run --cwd packages/core build
bun run --cwd packages/cli build

# ── Step 4: Build the site with workspace binaries ───────────────────────────
echo "=== Building site with workspace toolchain ==="
cd "$ROOT/site"

ZENITH_BUNDLER_BIN="$BUNDLER_BIN" \
ZENITH_COMPILER_BIN="$COMPILER_BIN" \
ZENITH_PREFER_WORKSPACE_PACKAGES=1 \
  node "$ROOT/packages/cli/dist/index.js" build

echo "Build exit: $?"
echo "Pages: $(cat dist/manifest.json | grep -c '"path"')"
echo "CSS size: $(wc -c < dist/static/assets/styles.*.css 2>/dev/null || echo 'NOT FOUND')"

# ── Step 5: Run the Vercel adapter ───────────────────────────────────────────
echo "=== Running Vercel adapter ==="
node scripts/vercel-adapter.mjs \
  --site-dir "$ROOT/site" \
  --output-dir "$ROOT/.vercel/output"

echo "=== Vercel build complete ==="
