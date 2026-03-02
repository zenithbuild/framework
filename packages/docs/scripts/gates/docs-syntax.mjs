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
  DOM_ANTIPATTERN_LABELS,
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

    const domAntipatternHits = [];
    const fences = extractCodeFences(parsed.body);
    for (const fence of fences) {
      const preceding = parsed.body.slice(Math.max(0, fence.index - 120), fence.index);
      const isMigrationBefore = /\b(?:before|migration)\s*:?\s*$/i.test(preceding.trim());
      if (isMigrationBefore) continue;
      for (const rule of DOM_ANTIPATTERN_LABELS) {
        if (rule.regex.test(fence.code) && !domAntipatternHits.includes(rule.label)) {
          domAntipatternHits.push(rule.label);
        }
      }
    }
    if (domAntipatternHits.length > 0) {
      violations.push(
        `${rel}: canonical doc must not recommend DOM anti-patterns (${domAntipatternHits.join(", ")}). Use zenWindow/zenDocument, zenOn, ref+zenMount, collectRefs.`
      );
    }

    if (hits.length > 0) {
      violations.push(`${rel}: forbidden syntax detected (${hits.join(", ")})`);
    }

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
