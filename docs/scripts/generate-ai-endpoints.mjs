#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const GENERATED_AT = process.env.GENERATED_AT || "2026-02-22";
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const AI_DIR = path.join(PUBLIC_DIR, "ai");
const DOCS_ROOT = path.join(ROOT, "documentation");
const BLOG_ROOT = path.join(ROOT, "blog");

const DOC_REQUIRED = ["title", "description", "version", "status", "last_updated", "tags"];
const BLOG_REQUIRED = ["title", "description", "date", "authors", "tags", "status"];

const MAX_ORDER = 999999;

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

function parseFrontmatter(content, filePath, requiredKeys) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error(`Missing frontmatter: ${filePath}`);
  }

  const meta = parseStructuredBlock(match[1]);

  for (const key of requiredKeys) {
    if (!(key in meta)) {
      throw new Error(`Missing required frontmatter key '${key}': ${filePath}`);
    }
  }

  if (!Array.isArray(meta.tags)) {
    throw new Error(`Frontmatter 'tags' must be an array: ${filePath}`);
  }

  return { meta, body: content.slice(match[0].length) };
}

function anchorize(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function sectionChunks(body) {
  const lines = body.split("\n");
  const sections = [];
  let heading = "Overview";
  let bucket = [];

  const flush = () => {
    const text = bucket.join("\n").trim();
    if (!text) {
      bucket = [];
      return;
    }
    sections.push({ heading, text });
    bucket = [];
  };

  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      continue;
    }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      flush();
      heading = h2[1].trim();
      continue;
    }
    bucket.push(line);
  }

  flush();

  if (sections.length === 0) {
    return [{ heading: "Overview", text: body.trim() }];
  }

  return sections;
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function xmlEscape(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildRss(posts) {
  const published = posts
    .filter((post) => post.meta.status === "published")
    .sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)));

  const items = published
    .map((post) => {
      const title = xmlEscape(post.meta.title);
      const description = xmlEscape(post.meta.description);
      const link = xmlEscape(post.url);
      const pubDate = new Date(`${post.meta.date}T00:00:00Z`).toUTCString();
      return [
        "    <item>",
        `      <title>${title}</title>`,
        `      <link>${link}</link>`,
        `      <guid>${link}</guid>`,
        `      <description>${description}</description>`,
        `      <pubDate>${pubDate}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\">",
    "  <channel>",
    "    <title>Zenith Blog</title>",
    "    <link>/blog</link>",
    "    <description>Zenith framework updates and release notes.</description>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

async function listContentFiles(rootDir, options = {}) {
  const out = [];
  const excludedDirs = new Set(options.excludeDirectories || []);

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name)) {
          continue;
        }
        await walk(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!/\.(md|mdx)$/i.test(entry.name)) {
        continue;
      }
      out.push(full);
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

  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function listDirectories(rootDir) {
  const dirs = [];

  async function walk(dir) {
    dirs.push(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await walk(path.join(dir, entry.name));
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

  dirs.sort((a, b) => a.localeCompare(b));
  return dirs;
}

function slugFromPath(fullPath, rootDir) {
  const rel = path.relative(rootDir, fullPath).replace(/\\/g, "/");
  return rel.replace(/\.(md|mdx)$/i, "");
}

function stripDatePrefix(slug) {
  const match = String(slug || "").match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  if (!match) {
    return String(slug || "");
  }
  return match[1];
}

function stripNumericPrefix(name) {
  const match = String(name || "").match(/^(\d+)[-_](.+)$/);
  if (!match) {
    return { name: String(name || ""), orderHint: null };
  }
  return { name: match[2], orderHint: Number.parseInt(match[1], 10) };
}

function titleCaseFromSlug(raw) {
  return String(raw || "")
    .replace(/[-_]/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return [];
}

function rankOrder(value) {
  const num = asNumber(value);
  return num === null ? MAX_ORDER : num;
}

function compareNumber(a, b) {
  return rankOrder(a) - rankOrder(b);
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function resolveDocOrder(meta, fileStem) {
  if (meta && typeof meta === "object") {
    const nav = meta.nav && typeof meta.nav === "object" ? meta.nav : null;
    const candidates = [nav ? nav.order : null, meta.nav_order, meta.order];
    for (const candidate of candidates) {
      const value = asNumber(candidate);
      if (value !== null) {
        return value;
      }
    }
  }

  const prefixed = stripNumericPrefix(fileStem);
  return prefixed.orderHint;
}

function resolveHidden(meta) {
  const nav = meta && typeof meta.nav === "object" ? meta.nav : null;
  const hiddenRaw = nav ? nav.hidden : meta?.nav_hidden;
  if (typeof hiddenRaw === "boolean") {
    return hiddenRaw;
  }
  if (typeof hiddenRaw === "string") {
    return hiddenRaw.trim().toLowerCase() === "true";
  }
  return false;
}

function resolveLevel(meta) {
  const level = asNumber(meta?.level);
  if (level !== null) {
    return level;
  }
  const value = asString(meta?.level).toLowerCase();
  if (value === "beginner") {
    return 0;
  }
  if (value === "intermediate") {
    return 1;
  }
  if (value === "advanced") {
    return 2;
  }
  return null;
}

function relativePosixPath(fullPath, rootDir) {
  return path.relative(rootDir, fullPath).replace(/\\/g, "/");
}

function docsCategoryLookup(categoryMap, relPath) {
  const entry = categoryMap.get(relPath);
  if (entry) {
    return entry;
  }
  const segment = relPath.split("/").slice(-1)[0] || relPath;
  const stripped = stripNumericPrefix(segment);
  return {
    path: relPath,
    slug: stripped.name,
    title: titleCaseFromSlug(stripped.name),
    summary: "",
    order: stripped.orderHint,
  };
}

async function buildCategoryMetadata() {
  const dirs = await listDirectories(DOCS_ROOT);
  const categoryMap = new Map();

  for (const dir of dirs) {
    const rel = relativePosixPath(dir, DOCS_ROOT);
    if (!rel) {
      continue;
    }

    const segment = rel.split("/").slice(-1)[0];
    const stripped = stripNumericPrefix(segment);
    const categoryFile = path.join(dir, "_category.yml");
    let categoryMeta = {};
    try {
      const raw = await fs.readFile(categoryFile, "utf8");
      categoryMeta = parseStructuredBlock(raw);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }

    const title = asString(categoryMeta.title) || titleCaseFromSlug(stripped.name);
    const summary = asString(categoryMeta.summary);
    const order = asNumber(categoryMeta.order) ?? stripped.orderHint;

    categoryMap.set(rel, {
      path: rel,
      slug: stripped.name,
      title,
      summary,
      order,
    });
  }

  return categoryMap;
}

function enrichDocRecord(record, categoryMap) {
  const slugParts = record.slug.split("/");
  const docFile = slugParts[slugParts.length - 1];
  const strippedDoc = stripNumericPrefix(docFile);
  const dirParts = slugParts.slice(0, -1);

  let topCategoryOrder = null;
  let topCategorySlug = "root";
  let topCategoryTitle = "Root";
  let topCategorySummary = "";

  const categoryPath = [];
  const categoryTitles = [];

  if (dirParts.length > 0) {
    let chain = "";
    for (const part of dirParts) {
      chain = chain ? `${chain}/${part}` : part;
      const category = docsCategoryLookup(categoryMap, chain);
      categoryPath.push(category.slug);
      categoryTitles.push(category.title);
    }

    const topChain = dirParts[0];
    const topCategory = docsCategoryLookup(categoryMap, topChain);
    topCategoryOrder = topCategory.order;
    topCategorySlug = topCategory.slug;
    topCategoryTitle = topCategory.title;
    topCategorySummary = topCategory.summary;
  }

  const nav = record.meta.nav && typeof record.meta.nav === "object" ? record.meta.nav : {};
  const label = asString(nav.label) || asString(record.meta.nav_label) || asString(record.meta.title);

  return {
    ...record,
    doc_stem: strippedDoc.name,
    doc_order: resolveDocOrder(record.meta, docFile),
    hidden: resolveHidden(record.meta),
    level: resolveLevel(record.meta),
    prerequisites: asArray(record.meta.prerequisites),
    category: topCategorySlug,
    category_title: topCategoryTitle,
    category_summary: topCategorySummary,
    category_order: topCategoryOrder,
    category_path: categoryPath,
    category_titles: categoryTitles,
    nav_label: label,
  };
}

function sortDocs(docs) {
  return [...docs].sort((a, b) => {
    return (
      compareNumber(a.category_order, b.category_order) ||
      compareText(a.category, b.category) ||
      compareNumber(a.doc_order, b.doc_order) ||
      compareNumber(a.level, b.level) ||
      compareText(a.nav_label, b.nav_label) ||
      compareText(a.slug, b.slug)
    );
  });
}

function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    const dateCompare = String(b.meta.date).localeCompare(String(a.meta.date));
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return compareText(a.slug, b.slug);
  });
}

function buildDocsNav(sortedDocs) {
  const canonicalVisibleDocs = sortedDocs.filter((doc) => doc.meta.status === "canonical" && !doc.hidden);
  const categoryMap = new Map();

  for (const doc of canonicalVisibleDocs) {
    const key = doc.category || "root";
    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        slug: key,
        title: doc.category_title,
        summary: doc.category_summary,
        order: doc.category_order,
        docs: [],
      });
    }
    categoryMap.get(key).docs.push({
      slug: doc.slug,
      title: doc.meta.title,
      label: doc.nav_label,
      url: doc.url,
      order: doc.doc_order,
      level: doc.level,
      status: doc.meta.status,
      prerequisites: doc.prerequisites,
      source_path: doc.sourcePath,
    });
  }

  const categories = [...categoryMap.values()]
    .map((category) => ({
      ...category,
      docs: category.docs.sort((a, b) => {
        return (
          compareNumber(a.order, b.order) ||
          compareNumber(a.level, b.level) ||
          compareText(a.label, b.label) ||
          compareText(a.slug, b.slug)
        );
      }),
    }))
    .sort((a, b) => compareNumber(a.order, b.order) || compareText(a.slug, b.slug));

  return {
    generated_at: GENERATED_AT,
    categories,
    start_here: categories.flatMap((category) => category.docs.map((doc) => doc.url)),
  };
}

function llmsTxt(nav) {
  const lines = [
    "# llms.txt for Zenith Docs",
    "Project: Zenith (compiler-first UI)",
    "Docs: /docs",
    "",
    "Start here (ordered):",
  ];

  for (const category of nav.categories) {
    lines.push(`- ${category.title}:`);
    for (const doc of category.docs) {
      lines.push(`  - ${doc.url}`);
    }
  }

  lines.push(
    "",
    "Machine-readable:",
    "- /ai/docs.manifest.json",
    "- /ai/docs.index.jsonl",
    "- /ai/docs.sitemap.json",
    "- /ai/docs.nav.json",
    "",
  );

  return lines.join("\n");
}

async function buildDocsRecords(categoryMap) {
  const files = await listContentFiles(DOCS_ROOT, { excludeDirectories: ["_legacy"] });
  const records = [];
  for (const fullPath of files) {
    const raw = await fs.readFile(fullPath, "utf8");
    const rel = path.relative(ROOT, fullPath).replace(/\\/g, "/");
    const slug = slugFromPath(fullPath, DOCS_ROOT);
    let parsed;
    try {
      parsed = parseFrontmatter(raw, rel, DOC_REQUIRED);
    } catch {
      continue;
    }
    const { meta, body } = parsed;

    records.push(
      enrichDocRecord(
        {
          kind: "doc",
          slug,
          url: `/docs/${slug}`,
          sourcePath: rel,
          meta,
          body,
        },
        categoryMap,
      ),
    );
  }
  return records;
}

async function buildBlogRecords() {
  const files = await listContentFiles(BLOG_ROOT);
  const records = [];
  for (const fullPath of files) {
    const raw = await fs.readFile(fullPath, "utf8");
    const rel = path.relative(ROOT, fullPath).replace(/\\/g, "/");
    const sourceSlug = slugFromPath(fullPath, BLOG_ROOT);
    const slug = stripDatePrefix(sourceSlug);
    let parsed;
    try {
      parsed = parseFrontmatter(raw, rel, BLOG_REQUIRED);
    } catch {
      continue;
    }
    const { meta, body } = parsed;

    records.push({
      kind: "post",
      slug,
      url: `/blog/${slug}`,
      sourcePath: rel,
      meta,
      body,
      category: "blog",
      category_title: "Blog",
      category_summary: "",
      category_order: null,
      category_path: ["blog"],
      category_titles: ["Blog"],
      doc_order: null,
      level: null,
      hidden: false,
      prerequisites: [],
      nav_label: meta.title,
    });
  }
  return records;
}

async function computeOutputs() {
  const categoryMap = await buildCategoryMetadata();
  const docs = sortDocs(await buildDocsRecords(categoryMap));
  const posts = sortPosts(await buildBlogRecords());
  const all = [...docs, ...posts];

  const docsNav = buildDocsNav(docs);

  const manifestItems = [];
  const urls = [];
  const jsonlChunks = [];

  for (const entry of all) {
    if (entry.kind === "doc" && entry.meta.status !== "canonical") {
      continue;
    }
    if (entry.kind === "post" && entry.meta.status !== "published") {
      continue;
    }

    manifestItems.push({
      kind: entry.kind,
      slug: entry.slug,
      title: entry.meta.title,
      status: entry.meta.status,
      tags: entry.meta.tags,
      source_path: entry.sourcePath,
      url: entry.url,
      category: entry.category,
      category_title: entry.category_title,
      category_order: entry.category_order,
      category_path: entry.category_path,
      category_titles: entry.category_titles,
      doc_order: entry.doc_order,
      level: entry.level,
      hidden: entry.hidden,
      prerequisites: entry.prerequisites,
    });

    if ((entry.kind === "doc" && !entry.hidden) || entry.kind === "post") {
      urls.push(entry.url);
    }

    const chunks = sectionChunks(entry.body);
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      jsonlChunks.push({
        id: `${entry.slug}#${anchorize(chunk.heading)}`,
        kind: entry.kind,
        doc: entry.slug,
        title: entry.meta.title,
        heading: chunk.heading,
        tags: entry.meta.tags,
        url: entry.url,
        category_path: entry.category_titles,
        position: {
          category_order: rankOrder(entry.category_order),
          doc_order: rankOrder(entry.doc_order),
          chunk_order: i,
        },
        prerequisites: entry.prerequisites,
        text: chunk.text.replace(/\s+/g, " ").trim(),
      });
    }
  }

  const manifest = {
    project: "Zenith",
    version: "0.3",
    generated_at: GENERATED_AT,
    docs_root: "/docs",
    blog_root: "/blog",
    navigation: {
      categories: docsNav.categories.map((category) => ({
        slug: category.slug,
        title: category.title,
        summary: category.summary,
        order: category.order,
        count: category.docs.length,
      })),
    },
    items: manifestItems,
  };

  const sitemap = {
    generated_at: GENERATED_AT,
    urls,
  };

  const indexJsonl = jsonlChunks.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const rss = buildRss(posts);

  return {
    files: {
      llms: llmsTxt(docsNav),
      manifest: stableJson(manifest),
      indexJsonl,
      sitemap: stableJson(sitemap),
      nav: stableJson(docsNav),
      rss,
    },
    stats: {
      docs: docs.length,
      posts: posts.length,
      items: manifestItems.length,
      chunks: jsonlChunks.length,
      urls: urls.length,
      categories: docsNav.categories.length,
      publishedPosts: posts.filter((post) => post.meta.status === "published").length,
    },
  };
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const { files, stats } = await computeOutputs();

  const out = {
    llms: path.join(PUBLIC_DIR, "llms.txt"),
    manifest: path.join(AI_DIR, "docs.manifest.json"),
    indexJsonl: path.join(AI_DIR, "docs.index.jsonl"),
    sitemap: path.join(AI_DIR, "docs.sitemap.json"),
    nav: path.join(AI_DIR, "docs.nav.json"),
    rss: path.join(PUBLIC_DIR, "rss.xml"),
  };

  if (checkOnly) {
    const checks = [
      ["llms", out.llms, files.llms],
      ["manifest", out.manifest, files.manifest],
      ["indexJsonl", out.indexJsonl, files.indexJsonl],
      ["sitemap", out.sitemap, files.sitemap],
      ["nav", out.nav, files.nav],
      ["rss", out.rss, files.rss],
    ];

    let failed = false;
    for (const [name, filePath, expected] of checks) {
      const current = await readIfExists(filePath);
      if (current !== expected) {
        failed = true;
        console.error(`Drift detected: ${name} (${filePath})`);
      }
    }

    if (failed) {
      process.exitCode = 1;
      return;
    }

    console.log(
      `AI endpoint check passed: docs=${stats.docs} posts=${stats.posts} published=${stats.publishedPosts} items=${stats.items} chunks=${stats.chunks} urls=${stats.urls} categories=${stats.categories}`,
    );
    return;
  }

  await fs.mkdir(AI_DIR, { recursive: true });
  await fs.writeFile(out.llms, files.llms, "utf8");
  await fs.writeFile(out.manifest, files.manifest, "utf8");
  await fs.writeFile(out.indexJsonl, files.indexJsonl, "utf8");
  await fs.writeFile(out.sitemap, files.sitemap, "utf8");
  await fs.writeFile(out.nav, files.nav, "utf8");
  await fs.writeFile(out.rss, files.rss, "utf8");

  console.log(
    `Generated AI endpoints: docs=${stats.docs} posts=${stats.posts} published=${stats.publishedPosts} items=${stats.items} chunks=${stats.chunks} urls=${stats.urls} categories=${stats.categories}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
