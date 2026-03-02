#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  DOCS_ROOT,
  DEMOS_ROOT,
  parseFrontmatter,
  listMarkdown,
  toRelative,
  isPublicDocStatus,
  extractCodeFences,
  findForbiddenMatches,
  parseDemoShortcodeIds,
  readDemoRegistry,
} from "./shared.mjs";

function isZenFence(lang) {
  return lang === "zen" || lang === "zenith";
}

function normalizeDemoSourcePath(source) {
  const raw = String(source || "").trim();
  if (!raw) {
    return "";
  }
  const full = raw.startsWith("demos/") ? path.join(ROOT, raw) : path.join(DEMOS_ROOT, raw);
  return path.resolve(full);
}

function isWithin(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function loadCompiler() {
  const compilerPath = path.resolve(ROOT, "..", "zenith-compiler", "dist", "index.js");
  const mod = await import(pathToFileURL(compilerPath).href);
  if (!mod || typeof mod.compile !== "function") {
    throw new Error(`Compiler module missing compile(): ${compilerPath}`);
  }
  return mod.compile;
}

async function compileSnippet(compile, tempDir, baseName, source) {
  const filePath = path.join(tempDir, `${baseName}.zen`);
  await fs.writeFile(filePath, source, "utf8");
  compile(filePath);
}

const RESERVED_TEMPLATE_IDENTIFIERS = new Set([
  "true",
  "false",
  "null",
  "undefined",
]);

function collectScriptDeclarations(scriptSource) {
  const declared = new Set();

  for (const match of scriptSource.matchAll(/\b(?:const|let|var|state)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    declared.add(match[1]);
  }
  for (const match of scriptSource.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    declared.add(match[1]);
  }
  for (const match of scriptSource.matchAll(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\s*/g)) {
    declared.add(match[1]);
  }
  for (const match of scriptSource.matchAll(/\b(?:const|let|var)\s+\{([^}]+)\}\s*=/g)) {
    const tokens = match[1]
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    for (const token of tokens) {
      const aliasParts = token.split(/\bas\b|:/).map((part) => part.trim()).filter(Boolean);
      const name = aliasParts.length > 1 ? aliasParts[aliasParts.length - 1] : aliasParts[0];
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        declared.add(name);
      }
    }
  }
  for (const match of scriptSource.matchAll(/import\s+\{([^}]+)\}\s+from/g)) {
    const tokens = match[1]
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    for (const token of tokens) {
      const aliasMatch = token.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
      if (aliasMatch) {
        declared.add(aliasMatch[2] || aliasMatch[1]);
      }
    }
  }
  for (const match of scriptSource.matchAll(/import\s+([A-Za-z_][A-Za-z0-9_]*)\s+from/g)) {
    declared.add(match[1]);
  }

  declared.add("props");
  return declared;
}

function stripScriptBlocks(source) {
  return source.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
}

function validateNoFreeIdentifiers(source) {
  const scriptBlocks = Array.from(source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map(
    (match) => match[1],
  );
  const declared = new Set();
  for (const block of scriptBlocks) {
    for (const identifier of collectScriptDeclarations(block)) {
      declared.add(identifier);
    }
  }

  const template = stripScriptBlocks(source);
  const unknown = new Set();
  for (const match of template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const identifier = match[1];
    if (RESERVED_TEMPLATE_IDENTIFIERS.has(identifier)) {
      continue;
    }
    if (!declared.has(identifier)) {
      unknown.add(identifier);
    }
  }

  return Array.from(unknown).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const compile = await loadCompiler();
  const docsFiles = await listMarkdown(DOCS_ROOT, { excludeSegments: ["_legacy"] });
  const { registryPath, demos } = await readDemoRegistry();
  const demoIds = new Set();
  const violations = [];
  let snippetCount = 0;

  for (const [index, demo] of demos.entries()) {
    const id = String(demo?.id || "").trim();
    const route = String(demo?.route || "").trim();
    const sourceRaw = String(demo?.source || "").trim();

    if (!id) {
      violations.push(`${registryPath}: demos[${index}] is missing 'id'`);
      continue;
    }
    if (demoIds.has(id)) {
      violations.push(`${registryPath}: duplicate demo id '${id}'`);
      continue;
    }
    demoIds.add(id);

    if (route !== `/__docs-demo/${id}`) {
      violations.push(`${registryPath}: demo '${id}' route must be '/__docs-demo/${id}'`);
    }

    const sourcePath = normalizeDemoSourcePath(sourceRaw);
    if (!sourcePath || !isWithin(DEMOS_ROOT, sourcePath)) {
      violations.push(`${registryPath}: demo '${id}' source must resolve under demos/: '${sourceRaw}'`);
      continue;
    }

    let source;
    try {
      source = await fs.readFile(sourcePath, "utf8");
    } catch {
      violations.push(`${registryPath}: demo '${id}' source file not found: ${sourceRaw}`);
      continue;
    }

    const forbidden = findForbiddenMatches(source);
    if (forbidden.length > 0) {
      violations.push(`${sourceRaw}: forbidden syntax detected (${forbidden.join(", ")})`);
    }
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zenith-doc-snippets-"));
  try {
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

      for (const demoId of parseDemoShortcodeIds(parsed.body)) {
        if (!demoIds.has(demoId)) {
          violations.push(`${rel}: unknown demo shortcode id '${demoId}'`);
        }
      }

      const fences = extractCodeFences(parsed.body).filter((block) => isZenFence(block.lang));
      for (let i = 0; i < fences.length; i += 1) {
        const fence = fences[i];
        const forbidden = findForbiddenMatches(fence.code);
        if (forbidden.length > 0) {
          violations.push(`${rel}: zen code fence #${i + 1} has forbidden syntax (${forbidden.join(", ")})`);
          continue;
        }

        const hasAddEventListener = /\baddEventListener\s*\(/.test(fence.code);
        const hasBehaviorAllowMarker = /zen-allow-add-event-listener/i.test(fence.code);
        if (hasAddEventListener && !hasBehaviorAllowMarker) {
          violations.push(
            `${rel}: zen code fence #${i + 1} uses addEventListener without 'zen-allow-add-event-listener' marker`,
          );
          continue;
        }

        const freeIdentifiers = validateNoFreeIdentifiers(fence.code);
        if (freeIdentifiers.length > 0) {
          violations.push(
            `${rel}: zen code fence #${i + 1} has free identifiers (${freeIdentifiers.join(", ")})`,
          );
          continue;
        }

        snippetCount += 1;
        try {
          await compileSnippet(compile, tempDir, `doc_${snippetCount}`, fence.code);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          violations.push(`${rel}: zen code fence #${i + 1} failed compile (${message})`);
        }
      }
    }

    for (const demo of demos) {
      const id = String(demo?.id || "").trim();
      if (!id) {
        continue;
      }
      const sourcePath = normalizeDemoSourcePath(String(demo?.source || ""));
      if (!sourcePath || !isWithin(DEMOS_ROOT, sourcePath)) {
        continue;
      }
      try {
        const source = await fs.readFile(sourcePath, "utf8");
        snippetCount += 1;
        await compileSnippet(compile, tempDir, `demo_${id}`, source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        violations.push(`${String(demo?.source || "")}: demo '${id}' failed compile (${message})`);
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (violations.length > 0) {
    console.error(`docs:snippets failed with ${violations.length} issue(s):`);
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`docs:snippets passed (${snippetCount} snippets/demos compiled)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
