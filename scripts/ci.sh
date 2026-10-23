#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash ./scripts/ci-core.sh
bash ./scripts/ci-integration.sh
bash ./scripts/smoke.sh
