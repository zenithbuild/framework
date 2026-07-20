#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isPublicDocumentationPath } from "../public-documentation-policy.mjs";
import { parseFrontmatter } from "./ai-endpoints/frontmatter.mjs";

const DOCS_ROOT = path.resolve("docs/documentation");
const OUTPUT = path.resolve("docs/_internal/audits/public-documentation-inventory-2026-07-13.json");

async function listMarkdown(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listMarkdown(path.join(directory, entry.name), relativePath));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(relativePath);
  }
  return files;
}

function routeFor(relativePath) {
  return `/docs/${relativePath.replace(/\.md$/, "")}`;
}

function fencedCode(body) {
  return [...body.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map((match) => ({
    language: String(match[1] || "").trim(),
    source: String(match[2] || ""),
  }));
}

async function main() {
  const nav = JSON.parse(await readFile("docs/public/ai/docs.nav.json", "utf8"));
  const routes = new Set(nav.categories.flatMap((category) => category.docs.map((doc) => doc.url)));
  const files = (await listMarkdown(DOCS_ROOT)).sort((left, right) => left.localeCompare(right));
  const titleOwners = new Map();
  const bodyOwners = new Map();
  const records = [];

  for (const relativePath of files) {
    const raw = await readFile(path.join(DOCS_ROOT, relativePath), "utf8");
    const { meta, body } = parseFrontmatter(raw, relativePath, ["title", "description", "status"]);
    const publicPath = isPublicDocumentationPath(relativePath);
    const route = publicPath ? routeFor(relativePath) : null;
    const code = fencedCode(body);
    const bodyHash = createHash("sha256").update(body.trim().replace(/\s+/g, " ")).digest("hex");
    const duplicateTitle = titleOwners.get(meta.title) || null;
    const duplicateBody = bodyOwners.get(bodyHash) || null;
    titleOwners.set(meta.title, relativePath);
    bodyOwners.set(bodyHash, relativePath);

    records.push({
      filePath: `docs/documentation/${relativePath}`,
      title: meta.title,
      slug: relativePath.replace(/\.md$/, ""),
      route,
      description: meta.description,
      section: meta.section || null,
      sectionOrder: meta.sectionOrder ?? null,
      order: meta.order ?? null,
      publicationState: meta.status,
      public: publicPath && meta.status === "canonical",
      legacy: relativePath.split("/").includes("_legacy"),
      duplicateOf: duplicateTitle || duplicateBody,
      incomplete: body.trim().length < 160,
      codeExamples: code.length,
      codeExamplesAppearCurrent: !code.some(({ source }) => /\bonClick\s*=|@click\s*=|\{#(?:if|each)\}/.test(source)),
      routeResolves: route ? routes.has(route) : false,
    });
  }

  const result = {
    generatedAt: "2026-07-13",
    sourceRoot: "docs/documentation",
    inclusionRule: "Markdown paths with no underscore-prefixed segment and no _legacy segment; valid public files must be canonical.",
    totals: {
      inspected: records.length,
      public: records.filter((record) => record.public).length,
      excluded: records.filter((record) => !record.public).length,
      legacy: records.filter((record) => record.legacy).length,
      duplicates: records.filter((record) => record.duplicateOf).length,
      incomplete: records.filter((record) => record.incomplete).length,
      unresolvedRoutes: records.filter((record) => record.public && !record.routeResolves).length,
    },
    records,
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`wrote ${path.relative(process.cwd(), OUTPUT)} (${result.totals.public} public / ${result.totals.inspected} inspected)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
