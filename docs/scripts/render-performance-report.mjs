#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReportTitle,
  deriveReportSlug,
  renderBenchmarkReport,
} from "../../apps/benchmarks/scripts/lib/report-renderer.mjs";
import {
  loadResultSchema,
} from "../../apps/benchmarks/scripts/lib/config.mjs";
import {
  readAndValidateJsonFile,
} from "../../apps/benchmarks/scripts/lib/schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "..");
const resultsDocsDir = path.join(docsRoot, "documentation", "performance", "results");

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1] || "";
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const inputPath = readFlag("--input");
  if (!inputPath) {
    throw new Error("Missing required --input path");
  }

  const schema = await loadResultSchema();
  const result = await readAndValidateJsonFile(inputPath, schema);
  const explicitOutput = readFlag("--output");
  const outputPath = explicitOutput || path.join(resultsDocsDir, `${deriveReportSlug(result)}.md`);
  const title = buildReportTitle(result);
  const body = renderBenchmarkReport(result, {
    inputPath,
    outputPath,
  });
  const markdown = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(`Generated benchmark report derived from validated result JSON for run ${result.runId}.`)}`,
    'status: "draft"',
    `last_updated: ${JSON.stringify(todayStamp())}`,
    'tags: ["performance", "benchmarking", "results", "generated"]',
    "---",
    "",
    "> Generated from validated benchmark result JSON. This page is evidence-first and does not add ranking or winner language.",
    "",
    body,
  ].join("\n");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${markdown}\n`, "utf8");
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
