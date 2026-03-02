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

highest_published_version() {
  local package_name="$1"
  local output

  if output="$(npm view "${package_name}" versions --json 2>&1)"; then
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
    ' "$output"
    return
  fi

  if grep -Eq 'E404|404[[:space:]]+No match found' <<<"$output"; then
    return 0
  fi

  echo "npm view failed for ${package_name} versions:" >&2
  echo "$output" >&2
  exit 1
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
  publish_tag=""
  highest_version=""

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
      npm publish --access public --tag "$publish_tag"
    else
      npm publish --access public
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
