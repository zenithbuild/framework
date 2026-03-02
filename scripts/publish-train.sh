#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

if [[ $# -ne 0 ]]; then
  echo "Usage: $0 [--dry-run]" >&2
  exit 1
fi

TRAIN_VERSION=""
if [[ -f "$ROOT/TRAIN_VERSION" ]]; then
  TRAIN_VERSION="$(tr -d '[:space:]' < "$ROOT/TRAIN_VERSION")"
fi

PACKAGES=(
  "packages/compiler|@zenithbuild/compiler"
  "packages/bundler|@zenithbuild/bundler"
  "packages/runtime|@zenithbuild/runtime"
  "packages/router|@zenithbuild/router"
  "packages/core|@zenithbuild/core"
  "packages/cli|@zenithbuild/cli"
  "packages/create-zenith|create-zenith"
)

published=()
skipped=()
pending=()

read_manifest_field() {
  local manifest="$1"
  local field="$2"
  node -e '
    const fs = require("node:fs");
    const manifestPath = process.argv[1];
    const field = process.argv[2];
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const value = pkg[field];
    if (typeof value === "string") {
      process.stdout.write(value);
    } else if (value === undefined || value === null) {
      process.stdout.write("");
    } else {
      process.stdout.write(JSON.stringify(value));
    }
  ' "$manifest" "$field"
}

validate_publish_manifest() {
  local manifest="$1"
  node -e '
    const fs = require("node:fs");
    const manifestPath = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
      console.error(`Missing non-empty files whitelist in ${manifestPath}`);
      process.exit(1);
    }
    if (pkg.private === true) {
      console.error(`Refusing to publish private package manifest: ${manifestPath}`);
      process.exit(1);
    }
  ' "$manifest"
}

package_exists_on_npm() {
  local package_name="$1"
  local version="$2"
  local output

  if output="$(npm view "${package_name}@${version}" version 2>&1)"; then
    [[ "$output" == "$version" ]]
    return
  fi

  if grep -Eq 'E404|404[[:space:]]+No match found' <<<"$output"; then
    return 1
  fi

  echo "npm view failed for ${package_name}@${version}:" >&2
  echo "$output" >&2
  exit 1
}

print_list() {
  local heading="$1"
  local array_name="$2"
  local values=()
  local restore_nounset=0

  if [[ $- == *u* ]]; then
    restore_nounset=1
    set +u
  fi
  eval "values=(\"\${${array_name}[@]}\")"
  if [[ "$restore_nounset" -eq 1 ]]; then
    set -u
  fi

  echo "${heading}:"
  if [[ ${#values[@]} -eq 0 ]]; then
    echo "  - none"
    return
  fi

  local value
  for value in "${values[@]}"; do
    echo "  - ${value}"
  done
}

echo "Publishing Zenith train in strict order"
if [[ -n "$TRAIN_VERSION" ]]; then
  echo "TRAIN_VERSION=${TRAIN_VERSION}"
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Mode=dry-run"
else
  echo "Mode=publish"
fi
echo

for entry in "${PACKAGES[@]}"; do
  IFS='|' read -r package_dir expected_name <<<"$entry"
  manifest="${ROOT}/${package_dir}/package.json"

  if [[ ! -f "$manifest" ]]; then
    echo "Missing package manifest: ${manifest}" >&2
    exit 1
  fi

  validate_publish_manifest "$manifest"

  actual_name="$(read_manifest_field "$manifest" "name")"
  version="$(read_manifest_field "$manifest" "version")"

  if [[ "$actual_name" != "$expected_name" ]]; then
    echo "Package name mismatch in ${manifest}: expected ${expected_name}, found ${actual_name}" >&2
    exit 1
  fi

  if [[ -z "$version" ]]; then
    echo "Missing version in ${manifest}" >&2
    exit 1
  fi

  echo "Checking ${actual_name}@${version} (${package_dir})"

  if package_exists_on_npm "$actual_name" "$version"; then
    echo "  skip: already published"
    skipped+=("${actual_name}@${version}")
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  dry-run: would publish"
    pending+=("${actual_name}@${version}")
    continue
  fi

  (
    cd "${ROOT}/${package_dir}"
    npm publish --access public
  )
  echo "  published"
  published+=("${actual_name}@${version}")
done

echo
echo "Publish train summary"
if [[ -n "$TRAIN_VERSION" ]]; then
  echo "Train version: ${TRAIN_VERSION}"
fi
print_list "Published" published
if [[ "$DRY_RUN" -eq 1 ]]; then
  print_list "Would publish" pending
fi
print_list "Skipped (already published)" skipped
