#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DOCS_ROOT = path.join(ROOT, "documentation");
const BLOG_ROOT = path.join(ROOT, "blog");
const PUBLIC_DIR = path.join(ROOT, "public");
const AI_DIR = path.join(PUBLIC_DIR, "ai");

const DOC_REQUIRED = ["title", "description", "version", "status", "last_updated", "tags"];
const BLOG_REQUIRED = ["title", "description", "date", "authors", "tags", "status"];

const FORBIDDEN_SYNTAX = [
  { label: "string event attribute", regex: /onclick\s*=/i },
  { label: "vue click attribute", regex: /@click\s*=/i },
  { label: "react click prop", regex: /onClick\s*=/ },
  { label: "svelte each block", regex: /\{#each\b/ },
  { label: "svelte if block", regex: /\{#if\b/ },
  { label: "svelte await block", regex: /\{#await\b/ },
];

function stripFenceBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, "");
}

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

function parseStructuredBlock(content) {
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

function parseFrontmatter(content, filePath) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error(`Missing frontmatter: ${filePath}`);
  }
  const meta = parseStructuredBlock(match[1]);
  return { meta, body: content.slice(match[0].length) };
}

async function listMarkdown(rootDir) {
  const files = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
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

function toSlug(fullPath, rootDir) {
  return path
    .relative(rootDir, fullPath)
    .replace(/\\/g, "/")
    .replace(/\.(md|mdx)$/i, "");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function asArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Number.parseFloat(value.trim());
  }
  return null;
}

async function main() {
  const docsFiles = await listMarkdown(DOCS_ROOT);
  const blogFiles = await listMarkdown(BLOG_ROOT);

  const violations = [];
  const canonicalDocSlugs = [];
  const docsWithStatus = [];

  for (const fullPath of docsFiles) {
    const rel = path.relative(ROOT, fullPath).replace(/\\/g, "/");
    const raw = await fs.readFile(fullPath, "utf8");
    let parsed;
    try {
      parsed = parseFrontmatter(raw, rel);
    } catch {
      // Legacy docs without contract frontmatter stay out of canonical integrity checks.
      continue;
    }
    const { meta, body } = parsed;
    const status = typeof meta.status === "string" ? meta.status : "";
    if (!["canonical", "draft", "deprecated"].includes(status)) {
      continue;
    }

    const slug = toSlug(fullPath, DOCS_ROOT);
    docsWithStatus.push({ slug, rel, meta });

    for (const key of DOC_REQUIRED) {
      if (!(key in meta)) {
        violations.push(`${rel}: missing frontmatter key '${key}'`);
      }
    }
    if (!Array.isArray(meta.tags)) {
      violations.push(`${rel}: frontmatter 'tags' must be an array`);
    }

    if (meta.status === "canonical") {
      canonicalDocSlugs.push(slug);
    }

    const content = stripFenceBlocks(body);
    for (const rule of FORBIDDEN_SYNTAX) {
      if (rule.regex.test(content)) {
        violations.push(`${rel}: forbidden syntax detected (${rule.label})`);
      }
    }
  }

  const canonicalSlugSet = new Set(canonicalDocSlugs);
  const categoryRoots = new Set();

  for (const doc of docsWithStatus) {
    const prerequisites = asArray(doc.meta.prerequisites);
    for (const prereq of prerequisites) {
      if (!canonicalSlugSet.has(prereq)) {
        violations.push(`${doc.rel}: prerequisite references missing canonical slug '${prereq}'`);
      }
    }

    if (doc.meta.status === "canonical") {
      const topCategory = doc.slug.includes("/") ? doc.slug.split("/")[0] : "";
      if (topCategory) {
        categoryRoots.add(topCategory);
      }
    }
  }

  for (const category of categoryRoots) {
    const categoryFile = path.join(DOCS_ROOT, category, "_category.yml");
    if (!(await exists(categoryFile))) {
      violations.push(`missing category metadata: documentation/${category}/_category.yml`);
      continue;
    }
    const parsed = parseStructuredBlock(await fs.readFile(categoryFile, "utf8"));
    if (!String(parsed.title || "").trim()) {
      violations.push(`documentation/${category}/_category.yml: missing 'title'`);
    }
    if (asNumber(parsed.order) === null) {
      violations.push(`documentation/${category}/_category.yml: missing numeric 'order'`);
    }
  }

  for (const fullPath of blogFiles) {
    const rel = path.relative(ROOT, fullPath).replace(/\\/g, "/");
    const raw = await fs.readFile(fullPath, "utf8");
    let parsed;
    try {
      parsed = parseFrontmatter(raw, rel);
    } catch {
      violations.push(`${rel}: missing frontmatter`);
      continue;
    }
    const { meta, body } = parsed;

    for (const key of BLOG_REQUIRED) {
      if (!(key in meta)) {
        violations.push(`${rel}: missing frontmatter key '${key}'`);
      }
    }
    if (!Array.isArray(meta.tags)) {
      violations.push(`${rel}: frontmatter 'tags' must be an array`);
    }
    if (!Array.isArray(meta.authors)) {
      violations.push(`${rel}: frontmatter 'authors' must be an array`);
    }

    const content = stripFenceBlocks(body);
    for (const rule of FORBIDDEN_SYNTAX) {
      if (rule.regex.test(content)) {
        violations.push(`${rel}: forbidden syntax detected (${rule.label})`);
      }
    }
  }

  const llmsPath = path.join(PUBLIC_DIR, "llms.txt");
  const llms = await fs.readFile(llmsPath, "utf8");
  const llmsDocs = llms
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- /docs/"))
    .map((line) => line.slice(2));

  for (const url of llmsDocs) {
    const slug = url.replace(/^\/docs\//, "");
    const md = path.join(DOCS_ROOT, `${slug}.md`);
    const mdx = path.join(DOCS_ROOT, `${slug}.mdx`);
    if (!(await exists(md)) && !(await exists(mdx))) {
      violations.push(`llms.txt references missing docs page: ${url}`);
    }
  }

  const manifestPath = path.join(AI_DIR, "docs.manifest.json");
  const indexPath = path.join(AI_DIR, "docs.index.jsonl");
  const navPath = path.join(AI_DIR, "docs.nav.json");
  const manifest = await readJson(manifestPath);
  const nav = await readJson(navPath);
  const indexLines = (await fs.readFile(indexPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const manifestCanonical = new Set(
    manifest.items
      .filter((item) => item.kind === "doc" && item.status === "canonical")
      .map((item) => item.slug),
  );

  const navDocs = new Set(nav.categories.flatMap((category) => category.docs.map((doc) => doc.slug)));

  canonicalDocSlugs.sort((a, b) => a.localeCompare(b));
  for (const slug of canonicalDocSlugs) {
    if (!manifestCanonical.has(slug)) {
      violations.push(`canonical doc missing from manifest: ${slug}`);
    }
    if (!indexLines.some((row) => row.kind === "doc" && row.doc === slug)) {
      violations.push(`canonical doc missing from index chunks: ${slug}`);
    }
    if (!navDocs.has(slug)) {
      violations.push(`canonical doc missing from docs.nav.json: ${slug}`);
    }
  }

  const manifestWithMissingHierarchy = manifest.items.filter(
    (item) =>
      item.kind === "doc" &&
      item.status === "canonical" &&
      (!("category" in item) || !("category_order" in item) || !("doc_order" in item)),
  );
  for (const item of manifestWithMissingHierarchy) {
    violations.push(`manifest item missing navigation metadata: ${item.slug}`);
  }

  for (const category of nav.categories) {
    if (asNumber(category.order) === null) {
      violations.push(`docs.nav.json category '${category.slug}' missing numeric order`);
    }
  }

  if (!Array.isArray(nav.start_here) || nav.start_here.length === 0) {
    violations.push("docs.nav.json missing start_here entries");
  }

  if (violations.length > 0) {
    console.error(`Docs integrity check failed with ${violations.length} issue(s):`);
    for (const item of violations) {
      console.error(`- ${item}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Docs integrity check passed: docs=${docsFiles.length} blog_posts=${blogFiles.length} canonical_docs=${canonicalDocSlugs.length} llms_links=${llmsDocs.length} categories=${categoryRoots.size}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
