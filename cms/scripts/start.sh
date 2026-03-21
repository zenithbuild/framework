#!/usr/bin/env bash
set -e

# ─── Resolve Directus CLI runner ─────────────────────────────────────────────
if [ -f /directus/cli.js ]; then
  DIRECTUS_RUNNER="node /directus/cli.js"
  PACKAGE_RUNNER="npx"
  echo "🧭 Using bundled Directus CLI"
elif command -v bun >/dev/null 2>&1; then
  DIRECTUS_RUNNER="bunx directus"
  PACKAGE_RUNNER="bunx"
  echo "🐰 Using Bun (bunx) to run Directus CLI"
else
  DIRECTUS_RUNNER="npx directus"
  PACKAGE_RUNNER="npx"
  echo "📦 Using npx to run Directus CLI"
fi

# ─── Validate required environment variables ────────────────────────────────
: "${ADMIN_EMAIL:?❌ ADMIN_EMAIL environment variable is not set.}"
: "${ADMIN_PASSWORD:?❌ ADMIN_PASSWORD environment variable is not set.}"

# ─── 1) Bootstrap Directus (idempotent) ────────────────────────────────────
echo "🛠️  Bootstrapping Directus (safe to skip if already done)..."
if sh -c "$DIRECTUS_RUNNER bootstrap"; then
  echo "✅ Bootstrap completed."
else
  echo "⚠️  Bootstrap step failed or was already run, continuing..."
fi

# ─── 2) Start Directus in background ───────────────────────────────────────
echo "🚀 Starting Directus..."
sh -c "$DIRECTUS_RUNNER start" &
DIRECTUS_PID=$!

# ─── 3) Wait for Directus to respond ──────────────────────────────────────
echo "⏳ Waiting for Directus to be ready at http://localhost:8055..."
READY=0
for _ in $(seq 1 60); do
  if curl -s http://localhost:8055/server/ping | grep -q pong; then
    READY=1
    break
  fi
  if ! kill -0 "$DIRECTUS_PID" 2>/dev/null; then
    echo "❌ Directus exited before becoming ready."
    wait "$DIRECTUS_PID"
    exit 1
  fi
  sleep 2
done

if [ "$READY" -ne 1 ]; then
  echo "❌ Directus did not become ready within the startup window."
  wait "$DIRECTUS_PID"
  exit 1
fi

echo "✅ Directus is up!"

# ─── 4) Apply your local template ──────────────────────────────────────────
echo "📦 Applying local template from ./templates..."
if $PACKAGE_RUNNER directus-template-cli@latest apply \
  -p \
  --directusUrl="http://localhost:8055" \
  --userEmail="$ADMIN_EMAIL" \
  --userPassword="$ADMIN_PASSWORD" \
  --templateLocation="./templates" \
  --templateType="local"; then
  echo "🎉 Template applied successfully."
else
  echo "⚠️  Template apply failed. Directus will keep running so Studio stays reachable."
fi

# ─── 5) Tail off into the Directus process ─────────────────────────────────
wait $DIRECTUS_PID
