#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  asArray,
  asNumber,
  asString,
  compareNumber,
  compareText,
  docsCategoryLookup,
  listContentFiles,
  listDirectories,
  rankOrder,
  relativePosixPath,
  resolveDocOrder,
  resolveHidden,
  resolveLevel,
  slugFromPath,
  stripDatePrefix,
  stripNumericPrefix,
  titleCaseFromSlug,
} from "./ai-endpoints/content.mjs";
import { anchorize, buildRss, llmsTxt, sectionChunks, stableJson } from "./ai-endpoints/format.mjs";
import { parseFrontmatter, parseStructuredBlock } from "./ai-endpoints/frontmatter.mjs";
import {
  documentationSectionByTitle,
  isPublicDocumentationPath,
  PUBLIC_DOCUMENTATION_STATUS,
} from "../public-documentation-policy.mjs";

const GENERATED_AT = process.env.GENERATED_AT || "2026-02-22";
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const AI_DIR = path.join(PUBLIC_DIR, "ai");
const DOCS_ROOT = path.join(ROOT, "documentation");
const BLOG_ROOT = path.join(ROOT, "blog");

const DOC_REQUIRED = ["title", "description", "version", "status", "last_updated", "tags"];
const BLOG_REQUIRED = ["title", "description", "date", "authors", "tags", "status"];

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

  const configuredSection = documentationSectionByTitle(asString(record.meta.section));
  if (configuredSection) {
    topCategoryOrder = asNumber(record.meta.sectionOrder) ?? configuredSection.order;
    topCategorySlug = configuredSection.slug;
    topCategoryTitle = configuredSection.title;
    topCategorySummary = "";
  }

  const nav = record.meta.nav && typeof record.meta.nav === "object" ? record.meta.nav : {};
  const label = asString(nav.label) || asString(record.meta.nav_label) || asString(record.meta.title);

  return {
    ...record,
    doc_stem: strippedDoc.name,
    doc_order: asNumber(record.meta.order) ?? resolveDocOrder(record.meta, docFile),
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
  const canonicalVisibleDocs = sortedDocs.filter((doc) => doc.meta.status === PUBLIC_DOCUMENTATION_STATUS && !doc.hidden);
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

async function buildDocsRecords(categoryMap) {
  const files = await listContentFiles(DOCS_ROOT, { excludeDirectories: ["_legacy"] });
  const records = [];
  for (const fullPath of files) {
    const raw = await fs.readFile(fullPath, "utf8");
    const rel = path.relative(ROOT, fullPath).replace(/\\/g, "/");
    const docsRelativePath = path.relative(DOCS_ROOT, fullPath).replace(/\\/g, "/");
    if (!isPublicDocumentationPath(docsRelativePath)) {
      continue;
    }
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
    if (entry.kind === "doc" && entry.meta.status !== PUBLIC_DOCUMENTATION_STATUS) {
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
