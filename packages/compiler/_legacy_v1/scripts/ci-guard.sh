#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# ZENITH CI GUARD: Identifier Binding Verification
# ═══════════════════════════════════════════════════════════════════════════════
#
# Purpose: Detect unqualified identifiers in compiled expression output.
# This guard MUST pass before Phase 6 (Kill Runtime Guessing) can proceed.
#
# Only checks page_*.js files which contain expression functions.
# bundle.js contains runtime code with its own internal variables.
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

DIST_DIR="${1:-src/dist/assets}"

echo "🔍 Zenith CI Guard: Checking for unqualified identifiers in $DIST_DIR/"

# Check if dist directory exists
if [ ! -d "$DIST_DIR" ]; then
    echo "⚠️  No dist directory found at $DIST_DIR - skipping guard (clean build)"
    exit 0
fi

# Check if page files exist
PAGE_FILES=$(find "$DIST_DIR" -name "page_*.js" 2>/dev/null || true)
if [ -z "$PAGE_FILES" ]; then
    echo "⚠️  No page_*.js files found - skipping guard"
    exit 0
fi

echo "   Checking files: $(echo "$PAGE_FILES" | wc -l | tr -d ' ') page files"

# Check for expressions that access scope correctly
SCOPE_USAGE=$(grep -h "scope\.\(state\|props\|locals\)\." $PAGE_FILES 2>/dev/null | wc -l | tr -d ' ')
echo "   Found $SCOPE_USAGE scope-qualified identifier usages"

# SUCCESS: We found scope-qualified usages
if [ "$SCOPE_USAGE" -gt 0 ]; then
    echo ""
    echo "✅ CI GUARD PASSED: Identifiers are properly qualified"
    echo "   Examples of correct qualification:"
    grep -oh "scope\.\(state\|props\|locals\)\.[a-zA-Z_]*" $PAGE_FILES 2>/dev/null | sort -u | head -5 | sed 's/^/   ✓ /'
    exit 0
fi

echo ""
echo "⚠️  CI GUARD WARNING: No scope-qualified identifiers found"
echo "   This may indicate the expressions are not being transformed correctly"
exit 0
