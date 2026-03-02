#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  DOCS_ROOT,
  DOC_STATUS_VALUES,
  parseFrontmatter,
  listMarkdown,
  toRelative,
} from "./shared.mjs";

const REQUIRED_DOC_KEYS = ["title", "status"];

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
