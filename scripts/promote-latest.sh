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

TRAIN_VERSION="$(tr -d '[:space:]' < "$ROOT/TRAIN_VERSION")"
NPM_BIN="${NPM_BIN:-npm}"
NPM_REGISTRY_URL="${PUBLISH_NPM_REGISTRY:-https://registry.npmjs.org/}"
PROMOTE_PACKAGE_FILTER="${PROMOTE_PACKAGE_FILTER:-}"

PACKAGES=(
  "@zenithbuild/core"
  "@zenithbuild/cli"
  "@zenithbuild/compiler"
  "@zenithbuild/runtime"
  "@zenithbuild/router"
  "@zenithbuild/bundler"
  "@zenithbuild/language"
  "@zenithbuild/language-server"
)

selected_packages=()
selected_beta_tags=()
promote_packages=()
already_latest_packages=()
failures=()

append_failure() {
  failures+=("$1")
}

package_selected_for_promotion() {
  local package_name="$1"
  local filter="${PROMOTE_PACKAGE_FILTER// /}"

  if [[ -z "$filter" ]]; then
    return 0
  fi

  local entry
  IFS=',' read -r -a selected <<<"$filter"
  for entry in "${selected[@]}"; do
    if [[ "$entry" == "$package_name" ]]; then
      return 0
    fi
  done

  return 1
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
    JSON.parse(payload);
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

package_version_exists() {
  local package_name="$1"
  local version="$2"
  local output
  local status

  if output="$(npm_view_json "${package_name}@${version} version" "${package_name}@${version}" version)"; then
    if [[ -z "${output//[[:space:]]/}" ]]; then
      echo "Empty npm view payload for ${package_name}@${version} version" >&2
      exit 1
    fi
    return 0
  else
    status=$?
  fi

  if [[ "$status" -eq 3 ]]; then
    return 1
  fi

  exit "$status"
}

json_field() {
  local json="$1"
  local field="$2"
  node -e '
    const payload = JSON.parse(process.argv[1]);
    const key = process.argv[2];
    const value = payload[key];
    if (value === undefined || value === null) {
      process.stdout.write("");
    } else {
      process.stdout.write(String(value));
    }
  ' "$json" "$field"
}

semver_compare() {
  node -e '
    function parse(version) {
      if (!version) return null;
      const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
      if (!match) {
        console.error(`Invalid semver: ${version}`);
        process.exit(1);
      }
      return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] || "",
      };
    }

    const left = parse(process.argv[1]);
    const right = parse(process.argv[2]);

    if (!left && !right) {
      process.stdout.write("0");
      process.exit(0);
    }
    if (!left) {
      process.stdout.write("-1");
      process.exit(0);
    }
    if (!right) {
      process.stdout.write("1");
      process.exit(0);
    }

    for (const key of ["major", "minor", "patch"]) {
      if (left[key] < right[key]) {
        process.stdout.write("-1");
        process.exit(0);
      }
      if (left[key] > right[key]) {
        process.stdout.write("1");
        process.exit(0);
      }
    }

    if (left.prerelease === right.prerelease) {
      process.stdout.write("0");
      process.exit(0);
    }
    if (!left.prerelease && right.prerelease) {
      process.stdout.write("1");
      process.exit(0);
    }
    if (left.prerelease && !right.prerelease) {
      process.stdout.write("-1");
      process.exit(0);
    }
    process.stdout.write(left.prerelease < right.prerelease ? "-1" : "1");
  ' "$1" "$2"
}

write_summary() {
  local line="$1"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$line" >> "$GITHUB_STEP_SUMMARY"
  fi
}

echo "Promoting latest for train version ${TRAIN_VERSION}"

for package_name in "${PACKAGES[@]}"; do
  if ! package_selected_for_promotion "$package_name"; then
    continue
  fi

  echo "Checking ${package_name}@${TRAIN_VERSION}"

  if ! package_version_exists "$package_name" "$TRAIN_VERSION"; then
    append_failure "${package_name}@${TRAIN_VERSION} is not published on npm"
    continue
  fi

  tags_output="$(npm_view_json "${package_name} dist-tags" "$package_name" dist-tags)"
  tags_json="$(extract_npm_json "${package_name} dist-tags" "$tags_output")"
  latest_tag="$(json_field "$tags_json" latest)"
  train_tag="$(json_field "$tags_json" train)"
  beta_tag="$(json_field "$tags_json" beta)"

  selected_packages+=("$package_name")
  selected_beta_tags+=("$beta_tag")

  if [[ "$train_tag" != "$TRAIN_VERSION" ]]; then
    append_failure "${package_name} train tag is ${train_tag:-<missing>}, expected ${TRAIN_VERSION}"
    continue
  fi

  if [[ -n "$latest_tag" ]]; then
    comparison="$(semver_compare "$latest_tag" "$TRAIN_VERSION")"
    if [[ "$comparison" == "1" ]]; then
      append_failure "${package_name} latest tag ${latest_tag} is ahead of ${TRAIN_VERSION}"
      continue
    fi
  fi

  if [[ "$latest_tag" == "$TRAIN_VERSION" ]]; then
    already_latest_packages+=("$package_name")
  else
    promote_packages+=("$package_name")
  fi
done

if [[ ${#selected_packages[@]} -eq 0 ]]; then
  echo "No packages selected for promotion."
  exit 0
fi

if [[ ${#failures[@]} -gt 0 ]]; then
  printf 'Promotion preflight failed:\n' >&2
  for failure in "${failures[@]}"; do
    printf ' - %s\n' "$failure" >&2
  done
  exit 1
fi

if [[ ${#promote_packages[@]} -eq 0 ]]; then
  echo "All selected packages already point latest to ${TRAIN_VERSION}."
else
  for package_name in "${promote_packages[@]}"; do
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "dry-run: would promote ${package_name}@${TRAIN_VERSION} -> latest"
    else
      echo "Promoting ${package_name}@${TRAIN_VERSION} -> latest"
      "$NPM_BIN" dist-tag add "${package_name}@${TRAIN_VERSION}" latest --registry "$NPM_REGISTRY_URL"
    fi
  done
fi

echo
echo "Verifying final dist-tags"

write_summary "## Promote latest"
write_summary "- Target version: \`${TRAIN_VERSION}\`"

if [[ ${#promote_packages[@]} -eq 0 ]]; then
  write_summary "- Promoted: none (already aligned)"
else
  write_summary "- Promoted:"
  for package_name in "${promote_packages[@]}"; do
    write_summary "  - \`${package_name}\`"
  done
fi

if [[ ${#already_latest_packages[@]} -gt 0 ]]; then
  write_summary "- Already latest:"
  for package_name in "${already_latest_packages[@]}"; do
    write_summary "  - \`${package_name}\`"
  done
fi

for index in "${!selected_packages[@]}"; do
  package_name="${selected_packages[$index]}"
  expected_beta="${selected_beta_tags[$index]}"

  tags_output="$(npm_view_json "${package_name} dist-tags" "$package_name" dist-tags)"
  tags_json="$(extract_npm_json "${package_name} dist-tags" "$tags_output")"
  latest_tag="$(json_field "$tags_json" latest)"
  train_tag="$(json_field "$tags_json" train)"
  beta_tag="$(json_field "$tags_json" beta)"

  if [[ "$latest_tag" != "$TRAIN_VERSION" ]]; then
    echo "Verification failed: ${package_name} latest tag is ${latest_tag:-<missing>}, expected ${TRAIN_VERSION}" >&2
    exit 1
  fi

  if [[ "$train_tag" != "$TRAIN_VERSION" ]]; then
    echo "Verification failed: ${package_name} train tag is ${train_tag:-<missing>}, expected ${TRAIN_VERSION}" >&2
    exit 1
  fi

  if [[ "$beta_tag" != "$expected_beta" ]]; then
    echo "Verification failed: ${package_name} beta tag changed from ${expected_beta:-<missing>} to ${beta_tag:-<missing>}" >&2
    exit 1
  fi

  printf '%s: latest=%s train=%s beta=%s\n' "$package_name" "$latest_tag" "$train_tag" "${beta_tag:-<missing>}"
  write_summary "- \`${package_name}\`: latest=\`${latest_tag}\`, train=\`${train_tag}\`, beta=\`${beta_tag:-<missing>}\`"
done
