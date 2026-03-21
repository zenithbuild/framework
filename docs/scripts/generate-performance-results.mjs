#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPublishableComparison } from "../../apps/benchmarks/scripts/lib/comparison-gates.mjs";
import {
  buildReportTitle,
  renderBenchmarkReport,
} from "../../apps/benchmarks/scripts/lib/report-renderer.mjs";
import {
  renderComparativeReport,
} from "../../apps/benchmarks/scripts/lib/comparison-renderer.mjs";
import {
  loadResultSchema,
} from "../../apps/benchmarks/scripts/lib/config.mjs";
import {
  loadManifest,
  readFlag,
  resolveManifestContext,
  resolveManifestPages,
  writePinnedSnapshotManifest,
} from "./lib/performance-results-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "..");

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function frontmatter(title, description) {
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    'status: "draft"',
    `last_updated: ${JSON.stringify(todayStamp())}`,
    'tags: ["performance", "benchmarking", "results", "generated"]',
    "---",
    "",
    "> Generated from validated benchmark result JSON and the benchmark results manifest.",
    "",
  ].join("\n");
}

function groupPagesBySection(pages) {
  const grouped = new Map();
  for (const page of pages) {
    const section = page.section || "Results";
    const bucket = grouped.get(section) || [];
    bucket.push(page);
    grouped.set(section, bucket);
  }
  return grouped;
}

async function renderRunPage(page, resultsDir) {
  const outputPath = path.join(resultsDir, page.output);
  const result = page.input.result;
  const markdown = [
    frontmatter(page.title || buildReportTitle(result), page.description || `Generated benchmark report for run ${result.runId}.`),
    renderBenchmarkReport(result, { inputPath: page.input.inputPath, outputPath }),
  ].join("");
  await fs.writeFile(outputPath, `${markdown}\n`, "utf8");
  return {
    ...page,
    title: page.title || buildReportTitle(result),
    description: page.description || `Generated benchmark report for run ${result.runId}.`,
    outputPath,
  };
}

async function renderComparisonPage(page, resultsDir) {
  const inputPathMap = new Map(page.inputs.map((entry) => [entry.result.runId, entry.inputPath]));
  const outputPath = path.join(resultsDir, page.output);
  const markdown = [
    frontmatter(page.title, page.description || `Generated comparative report for ${page.id}.`),
    renderComparativeReport(page, page.inputs.map((entry) => entry.result), { outputPath, inputPathMap }),
  ].join("");
  await fs.writeFile(outputPath, `${markdown}\n`, "utf8");
  return {
    ...page,
    outputPath,
  };
}

async function renderIndex(manifest, renderedPages, resultsDir) {
  const grouped = groupPagesBySection(renderedPages);
  const lines = [
    "---",
    `title: ${JSON.stringify(manifest.index.title)}`,
    `description: ${JSON.stringify(manifest.index.description)}`,
    'status: "draft"',
    `last_updated: ${JSON.stringify(todayStamp())}`,
    'tags: ["performance", "benchmarking", "results", "generated"]',
    "---",
    "",
    "# Benchmark Results",
    "",
    ...((manifest.index.intro || []).flatMap((line) => [line, ""])),
    "The pages below are generated from the results manifest rather than maintained by hand.",
  ];

  for (const [section, pages] of grouped.entries()) {
    lines.push("", `## ${section}`);
    for (const page of pages) {
      lines.push(`- [${page.title}](./${page.output})`);
      if (page.description) {
        lines.push(`  ${page.description}`);
      }
    }
  }

  await fs.writeFile(path.join(resultsDir, "index.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const context = resolveManifestContext(docsRoot, readFlag("--manifest"));
  const schema = await loadResultSchema();
  const pinSnapshots = process.argv.includes("--pin-snapshots");
  let manifest = await loadManifest(context.manifestAbsolutePath);
  let resolved = await resolveManifestPages(manifest, context, schema, { pinSnapshots });

  if (pinSnapshots) {
    await writePinnedSnapshotManifest(resolved.manifest, resolved.pages, context.manifestAbsolutePath);
    manifest = await loadManifest(context.manifestAbsolutePath);
    resolved = await resolveManifestPages(manifest, context, schema);
  }

  for (const page of resolved.pages) {
    if (page.kind === "comparison") {
      assertPublishableComparison(page, page.inputs.map((entry) => entry.result));
    }
  }

  if (process.argv.includes("--check")) {
    console.log(`Validated performance results manifest: ${context.manifestAbsolutePath}`);
    console.log(`Resolved pages: ${resolved.pages.length}`);
    if (pinSnapshots) {
      console.log("Snapshot pages pinned.");
    }
    return;
  }

  const renderedPages = [];

  for (const page of resolved.pages) {
    if (page.kind === "comparison") {
      renderedPages.push(await renderComparisonPage(page, context.resultsDir));
      continue;
    }
    if (page.kind === "run") {
      renderedPages.push(await renderRunPage(page, context.resultsDir));
      continue;
    }
    throw new Error(`Unsupported manifest page kind: ${page.kind}`);
  }

  await renderIndex(resolved.manifest, renderedPages, context.resultsDir);
  console.log(`Generated performance results pages: ${renderedPages.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
