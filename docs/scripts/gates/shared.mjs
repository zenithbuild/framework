#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

export const ROOT = process.cwd();
export const DOCS_ROOT = path.join(ROOT, "documentation");
export const BLOG_ROOT = path.join(ROOT, "blog");
export const DEMOS_ROOT = path.join(ROOT, "demos");

export const DOC_STATUS_VALUES = new Set([
  "canonical",
  "draft",
  "deprecated",
  "internal",
  "archived",
]);

export const PUBLIC_DOC_STATUS_VALUES = new Set([
  "canonical",
  "draft",
  "deprecated",
]);

export const FORBIDDEN_PATTERNS = [
  { label: "string event attribute", regex: /<[a-z][^>]*\bonclick\s*=/ },
  { label: "react click prop", regex: /<[a-z][^>]*\bonClick\s*=/ },
  { label: "vue click attribute", regex: /@click\s*=/i },
  { label: "svelte each block", regex: /\{#each\b/ },
  { label: "svelte if block", regex: /\{#if\b/ },
  { label: "svelte await block", regex: /\{#await\b/ },
  { label: "alpine x- directive", regex: /\bx-[a-z0-9_-]+\s*=/i },
  { label: "vue v- directive", regex: /\bv-[a-z0-9_-]+\s*=/i },
  { label: "angular ng- directive", regex: /\bng-[a-z0-9_-]+\s*=/i },
  { label: "string on:event handler", regex: /on:[a-zA-Z0-9_-]+\s*=\s*["']/ },
  { label: "legacy mouseover binding", regex: /on:mouseover\b/i },
  { label: "legacy mouseout binding", regex: /on:mouseout\b/i },
];

/** Canonical docs must not recommend these DOM anti-patterns. _legacy/ is excluded. */
export const DOM_ANTIPATTERN_LABELS = [
  { label: "querySelector", regex: /\bquerySelector\s*\(/ },
  { label: "querySelectorAll", regex: /\bquerySelectorAll\s*\(/ },
  { label: "getElementById", regex: /\bgetElementById\s*\(/ },
  { label: "direct addEventListener", regex: /\.addEventListener\s*\(/ },
  { label: "runtimeWindow/runtimeDocument wrapper", regex: /\b(?:runtimeWindow|runtimeDocument)\b/ },
];

function stripComment(rawLine) {
  let quote = null;
  for (let i = 0; i < rawLine.length; i += 1) {
    const ch = rawLine[i];
    if (quote) {
      if (ch === quote && rawLine[i - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "#") {
      return rawLine.slice(0, i);
    }
  }
  return rawLine;
}

function parseScalar(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value);
    } catch {
      const inner = value.slice(1, -1).trim();
      if (!inner) {
        return [];
      }
      return inner.split(",").map((token) => parseScalar(token.trim()));
    }
  }
  return value;
}

export function parseStructuredBlock(content) {
  const data = {};
  let currentKey = null;

  for (const rawLine of content.split("\n")) {
    const withoutComments = stripComment(rawLine).replace(/\t/g, "  ").replace(/\r$/, "");
    if (!withoutComments.trim()) {
      continue;
    }

    const indent = (withoutComments.match(/^ */) || [""])[0].length;
    const line = withoutComments.trim();

    if (indent > 0 && currentKey) {
      if (line.startsWith("- ")) {
        if (!Array.isArray(data[currentKey])) {
          data[currentKey] = [];
        }
        data[currentKey].push(parseScalar(line.slice(2)));
        continue;
      }

      const nestedIdx = line.indexOf(":");
      if (nestedIdx <= 0) {
        continue;
      }

      const nestedKey = line.slice(0, nestedIdx).trim();
      const nestedValueRaw = line.slice(nestedIdx + 1).trim();
      if (!data[currentKey] || typeof data[currentKey] !== "object" || Array.isArray(data[currentKey])) {
        data[currentKey] = {};
      }
      data[currentKey][nestedKey] = nestedValueRaw ? parseScalar(nestedValueRaw) : "";
      continue;
    }

    const idx = line.indexOf(":");
    if (idx <= 0) {
      currentKey = null;
      continue;
    }

    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 1).trim();
    if (!valueRaw) {
      data[key] = {};
      currentKey = key;
      continue;
    }

    data[key] = parseScalar(valueRaw);
    currentKey = null;
  }

  return data;
}

export function parseFrontmatter(content, filePath) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error(`Missing frontmatter: ${filePath}`);
  }
  const meta = parseStructuredBlock(match[1]);
  return { meta, body: content.slice(match[0].length) };
}

export async function listMarkdown(rootDir, options = {}) {
  const files = [];
  const excludeSegments = new Set(options.excludeSegments || []);

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludeSegments.has(entry.name)) {
          continue;
        }
        await walk(full);
        continue;
      }

      if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
        files.push(full);
      }
    }
  }

  try {
    await walk(rootDir);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export function toRelative(fullPath) {
  return path.relative(ROOT, fullPath).replace(/\\/g, "/");
}

export function toDocSlug(fullPath) {
  return path
    .relative(DOCS_ROOT, fullPath)
    .replace(/\\/g, "/")
    .replace(/\.(md|mdx)$/i, "");
}

export function asArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

export function extractCodeFences(body) {
  const blocks = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    blocks.push({
      lang: String(match[1] || "").trim().toLowerCase(),
      code: String(match[2] || ""),
      index: match.index,
    });
  }
  return blocks;
}

export function findForbiddenMatches(source) {
  const hits = [];
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.regex.test(source)) {
      hits.push(rule.label);
    }
  }
  return hits;
}

export function parseDemoShortcodeIds(source) {
  const ids = [];
  const regex = /:::demo\s+id\s*=\s*"([a-zA-Z0-9_-]+)"[\s]*:::/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

export async function readDemoRegistry() {
  const registryPath = path.join(DEMOS_ROOT, "registry.json");
  const raw = await fs.readFile(registryPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.demos)) {
    throw new Error(`Invalid demo registry: ${registryPath}`);
  }
  return {
    registryPath,
    version: parsed.version,
    demos: parsed.demos,
  };
}

export function hasDocStatus(status) {
  return DOC_STATUS_VALUES.has(String(status || ""));
}

export function isPublicDocStatus(status) {
  return PUBLIC_DOC_STATUS_VALUES.has(String(status || ""));
}
