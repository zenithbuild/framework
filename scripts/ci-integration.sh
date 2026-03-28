#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${ZENITH_CI_PREPARE:-0}" == "1" ]]; then
  bash ./scripts/build.sh
fi

bun run --cwd apps/integration-tests test:ci
