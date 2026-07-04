#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  DOCS_ROOT,
  DOC_STATUS_VALUES,
  findEmptyRequiredCategories,
  isPublicDocStatus,
  parseFrontmatter,
  listMarkdown,
  toRelative,
} from "./shared.mjs";

const REQUIRED_DOC_KEYS = ["title", "status"];

// Categories that must contain at least one public markdown page, not just a
// _category.yml. Onboarding categories belong here so the first-run path can
// never silently regress to an empty category.
const REQUIRED_NON_EMPTY_CATEGORIES = ["getting-started"];

function fail(violations) {
  if (violations.length === 0) {
    return;
  }
  console.error(`docs:structure failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
}

async function main() {
  const docsFiles = await listMarkdown(DOCS_ROOT, { excludeSegments: ["_legacy"] });
  const violations = [];
  // { category, public } per doc, for required-category coverage checks.
  const categoryRecords = [];

  for (const fullPath of docsFiles) {
    const rel = toRelative(fullPath);
    const raw = await fs.readFile(fullPath, "utf8");

    let parsed;
    try {
      parsed = parseFrontmatter(raw, rel);
    } catch (error) {
      violations.push(String(error instanceof Error ? error.message : error));
      continue;
    }

    const { meta } = parsed;
    for (const key of REQUIRED_DOC_KEYS) {
      if (!(key in meta)) {
        violations.push(`${rel}: missing required frontmatter key '${key}'`);
      }
    }

    const status = typeof meta.status === "string" ? meta.status.trim() : "";
    if (!DOC_STATUS_VALUES.has(status)) {
      violations.push(
        `${rel}: invalid status '${status || "<missing>"}'. Expected one of ${[...DOC_STATUS_VALUES].join(", ")}`,
      );
    }

    if (status === "internal" || status === "archived") {
      const relToDocs = path.relative(DOCS_ROOT, fullPath).replace(/\\/g, "/");
      if (!relToDocs.startsWith("_legacy/")) {
        violations.push(`${rel}: status '${status}' is only allowed under documentation/_legacy`);
      }
    }

    if ("tags" in meta && !Array.isArray(meta.tags)) {
      violations.push(`${rel}: frontmatter 'tags' must be an array when present`);
    }

    if ("version" in meta && "since" in meta) {
      violations.push(`${rel}: use either 'version' or 'since', not both`);
    }

    // Track category coverage for required non-empty categories. A category is
    // covered when it has at least one public-status markdown page. Top-level
    // docs (no directory segment) are not category coverage candidates.
    const relToDocs = path.relative(DOCS_ROOT, fullPath).replace(/\\/g, "/");
    const firstSegment = relToDocs.split("/")[0];
    categoryRecords.push({
      category: firstSegment && firstSegment !== relToDocs ? firstSegment : null,
      public: isPublicDocStatus(status),
    });
  }

  for (const category of findEmptyRequiredCategories(categoryRecords, REQUIRED_NON_EMPTY_CATEGORIES)) {
    violations.push(
      `documentation/${category}/: required category has no public page. Add at least one canonical/draft/deprecated markdown page (a _category.yml alone is not enough).`,
    );
  }

  fail(violations);
  if (process.exitCode === 1) {
    return;
  }

  console.log(`docs:structure passed (${docsFiles.length} docs scanned)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
