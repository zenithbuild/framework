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

FALLBACK_DIST_TAG="${PUBLISH_FALLBACK_TAG:-latest}"
NPM_REGISTRY_URL="${PUBLISH_NPM_REGISTRY:-https://registry.npmjs.org/}"
NPM_BIN="${NPM_BIN:-npm}"
NODE_BIN="${NODE_BIN:-node}"
PACKAGES=()

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

extract_npm_json() {
  local description="$1"
  local output="$2"
  node -e '
    const description = process.argv[1];
    const raw = process.argv[2];
    const objectStart = raw.indexOf("{");
    const arrayStart = raw.indexOf("[");
    const start =
      objectStart === -1 ? arrayStart
      : arrayStart === -1 ? objectStart
      : Math.min(objectStart, arrayStart);

    if (start === -1) {
      console.error(`No JSON payload found in npm output for ${description}`);
      process.exit(1);
    }

    const payload = raw.slice(start).trim();
    try {
      JSON.parse(payload);
    } catch (error) {
      console.error(`Invalid JSON payload in npm output for ${description}: ${error.message}`);
      process.exit(1);
    }

    process.stdout.write(payload);
  ' "$description" "$output"
}

npm_view_not_found() {
  local output="$1"
  grep -Eq 'E404|404[[:space:]]+No match found|npm[[:space:]]+error[[:space:]]+code[[:space:]]+E404' <<<"$output"
}

npm_view_json() {
  local description="$1"
  shift
  local output

  if output="$(env -u NPM_CONFIG_TAG -u npm_config_tag "$NPM_BIN" view "$@" --json --loglevel=error --registry "$NPM_REGISTRY_URL" 2>&1)"; then
    printf '%s' "$output"
    return 0
  fi

  if npm_view_not_found "$output"; then
    return 3
  fi

  echo "npm view failed for ${description}:" >&2
  echo "$output" >&2
  return 1
}

package_exists_on_npm() {
  local package_name="$1"
  local version="$2"
  local output
  local status

  if output="$(npm_view_json "${package_name}@${version} dist-tags" "${package_name}@${version}" dist-tags)"; then
    extract_npm_json "${package_name}@${version} dist-tags" "$output" >/dev/null
    return
  else
    status=$?
  fi

  if [[ "$status" -eq 3 ]]; then
    return 1
  fi

  exit "$status"
}

highest_published_version() {
  local package_name="$1"
  local output
  local json
  local status

  if output="$(npm_view_json "${package_name} versions" "${package_name}" versions)"; then
    if ! json="$(extract_npm_json "${package_name} versions" "$output")"; then
      echo "Failed to extract JSON from npm output for ${package_name} versions" >&2
      echo "$output" >&2
      exit 1
    fi
    "$NODE_BIN" "./scripts/publish-version-utils.mjs" highest "$json"
    return
  else
    status=$?
  fi

  if [[ "$status" -eq 3 ]]; then
    return 0
  fi

  exit "$status"
}

compare_versions() {
  local left_version="$1"
  local right_version="$2"
  "$NODE_BIN" "./scripts/publish-version-utils.mjs" compare "$left_version" "$right_version"
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

load_publish_matrix() {
  local args=("$NODE_BIN" "./scripts/verify-publish-surface.mjs" "--list" "--selection" "scaffolder")
  PACKAGES=()
  while IFS= read -r line; do
    PACKAGES+=("$line")
  done < <("${args[@]}")

  if [[ "${#PACKAGES[@]}" -eq 0 ]]; then
    echo "No publish packages resolved from the authoritative publish surface matrix." >&2
    exit 1
  fi
}

verify_publish_surface() {
  "$NODE_BIN" "./scripts/verify-publish-surface.mjs" "--selection" "scaffolder"
}

echo "Publishing create-zenith scaffolder"
if [[ -n "$TRAIN_VERSION" ]]; then
  echo "TRAIN_VERSION=${TRAIN_VERSION}"
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Mode=dry-run"
else
  echo "Mode=publish"
fi
echo

echo "Verifying publish surface truth"
verify_publish_surface
load_publish_matrix
echo

for entry in "${PACKAGES[@]}"; do
  IFS='|' read -r package_dir expected_name <<<"$entry"
  manifest="${ROOT}/${package_dir}/package.json"
  publish_tag=""
  highest_version=""

  if [[ ! -f "$manifest" ]]; then
    echo "Missing package manifest: ${manifest}" >&2
    exit 1
  fi

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

  highest_version="$(highest_published_version "$actual_name")"
  if [[ -n "$highest_version" ]]; then
    compare_result="$(compare_versions "$version" "$highest_version")"
    if (( compare_result < 0 )); then
      publish_tag="$FALLBACK_DIST_TAG"
      echo "  highest published version is ${highest_version}; using --tag ${publish_tag}"
    fi
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ -n "$publish_tag" ]]; then
      echo "  dry-run: would publish with --tag ${publish_tag}"
      pending+=("${actual_name}@${version} (tag=${publish_tag})")
    else
      echo "  dry-run: would publish"
      pending+=("${actual_name}@${version}")
    fi
    continue
  fi

  (
    cd "${ROOT}/${package_dir}"
    if [[ -n "$publish_tag" ]]; then
      "$NPM_BIN" publish --access public --tag "$publish_tag" --registry "$NPM_REGISTRY_URL"
    else
      "$NPM_BIN" publish --access public --registry "$NPM_REGISTRY_URL"
    fi
  )
  echo "  published"
  if [[ -n "$publish_tag" ]]; then
    published+=("${actual_name}@${version} (tag=${publish_tag})")
  else
    published+=("${actual_name}@${version}")
  fi
done

echo
echo "Publish scaffolder summary"
if [[ -n "$TRAIN_VERSION" ]]; then
  echo "Train version: ${TRAIN_VERSION}"
fi
print_list "Published" published
if [[ "$DRY_RUN" -eq 1 ]]; then
  print_list "Would publish" pending
fi
print_list "Skipped (already published)" skipped
