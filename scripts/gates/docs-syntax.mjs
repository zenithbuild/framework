#!/usr/bin/env node

import fs from "node:fs/promises";
import {
  DOCS_ROOT,
  parseFrontmatter,
  listMarkdown,
  toRelative,
  findForbiddenMatches,
  isPublicDocStatus,
  extractCodeFences,
} from "./shared.mjs";

async function main() {
  const docsFiles = await listMarkdown(DOCS_ROOT, { excludeSegments: ["_legacy"] });
  const violations = [];
  let scanned = 0;

  for (const fullPath of docsFiles) {
    const rel = toRelative(fullPath);
    const raw = await fs.readFile(fullPath, "utf8");

    let parsed;
    try {
      parsed = parseFrontmatter(raw, rel);
    } catch {
      continue;
    }

    const status = typeof parsed.meta.status === "string" ? parsed.meta.status.trim() : "";
    if (!isPublicDocStatus(status)) {
      continue;
    }

    scanned += 1;
    const hits = findForbiddenMatches(parsed.body);
    if (hits.length > 0) {
      violations.push(`${rel}: forbidden syntax detected (${hits.join(", ")})`);
    }

    const fences = extractCodeFences(parsed.body);
    for (let i = 0; i < fences.length; i += 1) {
      const fence = fences[i];
      const source = fence.code;

      const hasDefaultOpen = /\bdefaultOpen\b/.test(source);
      const hasOnOpenChange = /\bonOpenChange\b/.test(source);
      const hasOpen = /\bopen\b/.test(source);

      const hasDefaultValue = /\bdefaultValue\b/.test(source);
      const hasOnValueChange = /\bonValueChange\b/.test(source);
      const hasValue = /\bvalue\b/.test(source);

      if (hasOnOpenChange && !(hasOpen || hasDefaultOpen)) {
        violations.push(
          `${rel}: code fence #${i + 1} uses onOpenChange without open/defaultOpen (controlled/uncontrolled contract)`,
        );
      }

      if (hasOnValueChange && !(hasValue || hasDefaultValue)) {
        violations.push(
          `${rel}: code fence #${i + 1} uses onValueChange without value/defaultValue (controlled/uncontrolled contract)`,
        );
      }

      const directCallEventBinding = /on:[a-zA-Z0-9_-]+\s*=\s*\{\s*[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\([^{}]*\)\s*;?\s*\}/;
      if (directCallEventBinding.test(source)) {
        violations.push(
          `${rel}: code fence #${i + 1} uses direct-call event binding (use function reference or inline arrow function)`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error(`docs:syntax failed with ${violations.length} issue(s):`);
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`docs:syntax passed (${scanned} public docs scanned)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
