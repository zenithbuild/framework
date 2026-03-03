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

FALLBACK_DIST_TAG="${PUBLISH_FALLBACK_TAG:-train}"
NPM_REGISTRY_URL="${PUBLISH_NPM_REGISTRY:-https://registry.npmjs.org/}"

PACKAGES=(
  "packages/bundler-darwin-arm64|@zenithbuild/bundler-darwin-arm64"
  "packages/bundler-darwin-x64|@zenithbuild/bundler-darwin-x64"
  "packages/bundler-linux-x64|@zenithbuild/bundler-linux-x64"
  "packages/bundler-win32-x64|@zenithbuild/bundler-win32-x64"
  "packages/bundler|@zenithbuild/bundler"
  "packages/compiler|@zenithbuild/compiler"
  "packages/runtime|@zenithbuild/runtime"
  "packages/router|@zenithbuild/router"
  "packages/core|@zenithbuild/core"
  "packages/cli|@zenithbuild/cli"
)
PUBLISH_PACKAGE_FILTER="${PUBLISH_PACKAGE_FILTER:-}"

published=()
skipped=()
pending=()

package_selected_for_publish() {
  local package_dir="$1"
  local package_name="$2"
  local filter="${PUBLISH_PACKAGE_FILTER// /}"

  if [[ -z "$filter" ]]; then
    return 0
  fi

  local entry
  IFS=',' read -r -a selected <<<"$filter"
  for entry in "${selected[@]}"; do
    if [[ "$entry" == "$package_dir" || "$entry" == "$package_name" ]]; then
      return 0
    fi
  done

  return 1
}

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
    const expectedRepositoryUrl = process.argv[2];
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
      console.error(`Missing non-empty files whitelist in ${manifestPath}`);
      process.exit(1);
    }
    if (pkg.private === true) {
      console.error(`Refusing to publish private package manifest: ${manifestPath}`);
      process.exit(1);
    }
    const repository = pkg.repository;
    const repositoryUrl =
      repository && typeof repository === "object"
        ? repository.url
        : typeof repository === "string"
          ? repository
          : "";
    if (typeof repositoryUrl !== "string" || repositoryUrl.trim() === "") {
      console.error(`Missing repository.url in ${manifestPath}`);
      process.exit(1);
    }
    if (repositoryUrl !== expectedRepositoryUrl) {
      console.error(
        `Invalid repository.url in ${manifestPath}: expected ${expectedRepositoryUrl}, found ${repositoryUrl}`
      );
      process.exit(1);
    }
  ' "$manifest" "https://github.com/zenithbuild/framework"
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

  if output="$(npm view "$@" --json --loglevel=error --registry "$NPM_REGISTRY_URL" 2>&1)"; then
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

package_has_any_published_version() {
  local package_name="$1"
  local output
  local status

  if output="$(npm_view_json "${package_name} package" "${package_name}" version)"; then
    extract_npm_json "${package_name} package" "$output" >/dev/null
    return 0
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

    node -e '
      function parseVersion(version) {
        const raw = String(version || "").trim();
        const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
        if (!match) {
          return null;
        }
        return {
          raw,
          major: Number.parseInt(match[1], 10),
          minor: Number.parseInt(match[2], 10),
          patch: Number.parseInt(match[3], 10),
          prerelease: match[4] || "",
          prereleaseParts: match[4] ? match[4].split(".") : []
        };
      }

      function compareIdentifiers(left, right) {
        const leftNumeric = /^\d+$/.test(left);
        const rightNumeric = /^\d+$/.test(right);
        if (leftNumeric && rightNumeric) {
          return Number(left) - Number(right);
        }
        if (leftNumeric) {
          return -1;
        }
        if (rightNumeric) {
          return 1;
        }
        return left.localeCompare(right);
      }

      function compareVersions(leftVersion, rightVersion) {
        const left = parseVersion(leftVersion);
        const right = parseVersion(rightVersion);
        if (!left || !right) {
          return 0;
        }

        const numberDelta =
          (left.major - right.major)
          || (left.minor - right.minor)
          || (left.patch - right.patch);
        if (numberDelta !== 0) {
          return numberDelta;
        }

        if (!left.prerelease && !right.prerelease) {
          return 0;
        }
        if (!left.prerelease) {
          return 1;
        }
        if (!right.prerelease) {
          return -1;
        }

        const length = Math.max(left.prereleaseParts.length, right.prereleaseParts.length);
        for (let index = 0; index < length; index += 1) {
          const leftPart = left.prereleaseParts[index];
          const rightPart = right.prereleaseParts[index];
          if (leftPart === undefined) {
            return -1;
          }
          if (rightPart === undefined) {
            return 1;
          }
          const delta = compareIdentifiers(leftPart, rightPart);
          if (delta !== 0) {
            return delta;
          }
        }

        return 0;
      }

      const raw = JSON.parse(process.argv[1]);
      const versions = Array.isArray(raw) ? raw : [raw];
      let highest = "";
      for (const version of versions) {
        if (typeof version !== "string") {
          continue;
        }
        if (!highest || compareVersions(version, highest) > 0) {
          highest = version;
        }
      }
      process.stdout.write(highest);
    ' "$json"
    return
  else
    status=$?
  fi

  if [[ "$status" -eq 3 ]]; then
    return 0
  fi

  exit "$status"
}

latest_dist_tag_version() {
  local package_name="$1"
  local output
  local json
  local status

  if output="$(npm_view_json "${package_name} dist-tags" "${package_name}" dist-tags)"; then
    if ! json="$(extract_npm_json "${package_name} dist-tags" "$output")"; then
      echo "Failed to extract JSON from npm output for ${package_name} dist-tags" >&2
      echo "$output" >&2
      exit 1
    fi

    node -e '
      const payload = JSON.parse(process.argv[1]);
      const latest = payload && typeof payload === "object" && typeof payload.latest === "string"
        ? payload.latest.trim()
        : "";
      process.stdout.write(latest);
    ' "$json"
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

  node -e '
    function parseVersion(version) {
      const raw = String(version || "").trim();
      const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
      if (!match) {
        return null;
      }
      return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        prerelease: match[4] || "",
        prereleaseParts: match[4] ? match[4].split(".") : []
      };
    }

    function compareIdentifiers(left, right) {
      const leftNumeric = /^\d+$/.test(left);
      const rightNumeric = /^\d+$/.test(right);
      if (leftNumeric && rightNumeric) {
        return Number(left) - Number(right);
      }
      if (leftNumeric) {
        return -1;
      }
      if (rightNumeric) {
        return 1;
      }
      return left.localeCompare(right);
    }

    function compareVersions(leftVersion, rightVersion) {
      const left = parseVersion(leftVersion);
      const right = parseVersion(rightVersion);
      if (!left || !right) {
        throw new Error(`Invalid semver comparison: ${leftVersion} vs ${rightVersion}`);
      }

      const numberDelta =
        (left.major - right.major)
        || (left.minor - right.minor)
        || (left.patch - right.patch);
      if (numberDelta !== 0) {
        return numberDelta;
      }

      if (!left.prerelease && !right.prerelease) {
        return 0;
      }
      if (!left.prerelease) {
        return 1;
      }
      if (!right.prerelease) {
        return -1;
      }

      const length = Math.max(left.prereleaseParts.length, right.prereleaseParts.length);
      for (let index = 0; index < length; index += 1) {
        const leftPart = left.prereleaseParts[index];
        const rightPart = right.prereleaseParts[index];
        if (leftPart === undefined) {
          return -1;
        }
        if (rightPart === undefined) {
          return 1;
        }
        const delta = compareIdentifiers(leftPart, rightPart);
        if (delta !== 0) {
          return delta;
        }
      }

      return 0;
    }

    process.stdout.write(String(compareVersions(process.argv[1], process.argv[2])));
  ' "$left_version" "$right_version"
}

assert_latest_publish_is_monotonic() {
  local package_name="$1"
  local version="$2"
  local publish_tag="${3:-}"
  local latest_version=""
  local compare_result=""

  if [[ -n "$publish_tag" && "$publish_tag" != "latest" ]]; then
    return 0
  fi

  latest_version="$(latest_dist_tag_version "$package_name")"
  if [[ -z "$latest_version" ]]; then
    return 0
  fi

  compare_result="$(compare_versions "$version" "$latest_version")"
  if (( compare_result < 0 )); then
    echo "Refusing implicit latest publish for ${package_name}: local version ${version} is lower than npm latest ${latest_version}." >&2
    echo "Publish this version on --tag ${FALLBACK_DIST_TAG} or bump the package version before publishing to latest." >&2
    exit 1
  fi
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
if [[ -n "$PUBLISH_PACKAGE_FILTER" ]]; then
  echo "Filter=${PUBLISH_PACKAGE_FILTER}"
fi
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

  if ! package_selected_for_publish "$package_dir" "$expected_name"; then
    continue
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

  if [[ "$DRY_RUN" -eq 0 ]] && ! package_has_any_published_version "$actual_name"; then
    echo "  fail: ${actual_name} has not been published to npm before." >&2
    echo "  Trusted publishing cannot bootstrap a brand-new npm package name." >&2
    echo "  Publish ${actual_name} once manually (or with a temporary token), configure npm trusted publishing for that package, then rerun this train." >&2
    exit 1
  fi

  highest_version="$(highest_published_version "$actual_name")"
  if [[ -n "$highest_version" ]]; then
    compare_result="$(compare_versions "$version" "$highest_version")"
    if (( compare_result < 0 )); then
      publish_tag="$FALLBACK_DIST_TAG"
      echo "  highest published version is ${highest_version}; using --tag ${publish_tag}"
    fi
  fi

  assert_latest_publish_is_monotonic "$actual_name" "$version" "$publish_tag"

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
      npm publish --access public --tag "$publish_tag" --registry "$NPM_REGISTRY_URL"
    else
      npm publish --access public --registry "$NPM_REGISTRY_URL"
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
echo "Publish train summary"
if [[ -n "$TRAIN_VERSION" ]]; then
  echo "Train version: ${TRAIN_VERSION}"
fi
print_list "Published" published
if [[ "$DRY_RUN" -eq 1 ]]; then
  print_list "Would publish" pending
fi
print_list "Skipped (already published)" skipped
