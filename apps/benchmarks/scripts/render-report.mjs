import { dirname, join, parse } from "node:path";
import { loadResultSchema } from "./lib/config.mjs";
import { deriveReportSlug, renderBenchmarkReport } from "./lib/report-renderer.mjs";
import { readAndValidateJsonFile } from "./lib/schema.mjs";
import { writeText } from "./lib/results.mjs";

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1] || "";
}

function resolveOutputPath(inputPath, result) {
  const explicit = readFlag("--output");
  if (explicit) {
    return explicit;
  }

  const parsed = parse(inputPath);
  if (parsed.name === "matrix") {
    return join(dirname(inputPath), "report.md");
  }

  return join(dirname(inputPath), `${deriveReportSlug(result)}.md`);
}

async function main() {
  const inputPath = readFlag("--input");
  if (!inputPath) {
    throw new Error("Missing required --input path");
  }

  const schema = await loadResultSchema();
  const result = await readAndValidateJsonFile(inputPath, schema);
  const outputPath = resolveOutputPath(inputPath, result);
  const markdown = renderBenchmarkReport(result, {
    inputPath,
    outputPath,
  });

  await writeText(outputPath, markdown);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
