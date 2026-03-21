import fs from "node:fs/promises";
import path from "node:path";
import { readAndValidateJsonFile } from "../../../apps/benchmarks/scripts/lib/schema.mjs";

const PRESET_FRAMEWORKS = ["zenith", "astro", "next-app-router", "nuxt"];

const BUILTIN_PRESETS = {
  "latest-matrix-per-framework": PRESET_FRAMEWORKS.map((frameworkId) => ({
    selector: { type: "latest", frameworkId, runner: "matrix" },
  })),
  "latest-browser-runtime-per-framework": PRESET_FRAMEWORKS.map((frameworkId) => ({
    selector: { type: "latest", frameworkId, trackId: "hydration-runtime" },
  })),
  "latest-build-startup-per-framework": PRESET_FRAMEWORKS.map((frameworkId) => ({
    selector: { type: "latest", frameworkId, trackId: "cold-build" },
  })),
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  value.forEach((entry, index) => {
    assertString(entry, `${label}[${index}]`);
  });
  return value;
}

function normalizeOutput(value, label) {
  const output = assertString(value, label);
  if (!output.endsWith(".md")) {
    throw new Error(`${label} must end with .md`);
  }
  if (path.isAbsolute(output) || output.includes("..")) {
    throw new Error(`${label} must be a relative markdown filename`);
  }
  return output;
}

function normalizeSelector(selector, label) {
  if (!isPlainObject(selector)) {
    throw new Error(`${label} must be an object`);
  }

  const type = selector.type || "latest";
  if (type !== "latest") {
    throw new Error(`${label}.type must be "latest"`);
  }

  const normalized = { type };
  for (const key of ["frameworkId", "trackId", "runner", "runId", "caseId"]) {
    if (key in selector) {
      normalized[key] = assertString(selector[key], `${label}.${key}`);
    }
  }

  if (!normalized.frameworkId && !normalized.trackId && !normalized.runner && !normalized.runId && !normalized.caseId) {
    throw new Error(`${label} must include at least one selector field`);
  }

  return normalized;
}

function normalizeInputSpec(value, label) {
  if (typeof value === "string") {
    return { path: assertString(value, label) };
  }
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a string or object`);
  }
  if ("path" in value && "selector" in value) {
    throw new Error(`${label} cannot declare both path and selector`);
  }
  if ("path" in value) {
    return { path: assertString(value.path, `${label}.path`) };
  }
  if ("selector" in value) {
    return { selector: normalizeSelector(value.selector, `${label}.selector`) };
  }
  throw new Error(`${label} must declare either path or selector`);
}

function normalizePinnedInputSpec(value, label) {
  const spec = normalizeInputSpec(value, label);
  if (!spec.path) {
    throw new Error(`${label} must be a path-based input for snapshot pinning`);
  }
  return spec;
}

function normalizeResolutionMode(value, label) {
  const mode = value || "moving";
  if (!["moving", "snapshot"].includes(mode)) {
    throw new Error(`${label} must be "moving" or "snapshot"`);
  }
  return mode;
}

function expandPreset(presetName, label) {
  const preset = BUILTIN_PRESETS[presetName];
  if (!preset) {
    throw new Error(`${label} references unknown preset "${presetName}"`);
  }
  return preset.map((entry, index) => normalizeInputSpec(entry, `${label}[${index}]`));
}

export function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1] || "";
}

export function resolveManifestContext(docsRoot, explicitManifestPath = "") {
  const repoRoot = path.resolve(docsRoot, "..");
  const defaultManifestPath = path.join(docsRoot, "documentation", "performance", "results", "manifest.json");
  const manifestAbsolutePath = explicitManifestPath
    ? path.resolve(explicitManifestPath)
    : defaultManifestPath;
  const resultsDir = path.dirname(manifestAbsolutePath);
  const benchmarkResultsRoot = path.join(repoRoot, "apps", "benchmarks", "results");

  return {
    repoRoot,
    manifestAbsolutePath,
    resultsDir,
    benchmarkResultsRoot,
  };
}

export async function loadManifest(manifestAbsolutePath) {
  const raw = await fs.readFile(manifestAbsolutePath, "utf8");
  return JSON.parse(raw);
}

export function validateManifestShape(manifest) {
  if (!isPlainObject(manifest)) {
    throw new Error("Manifest root must be an object");
  }
  if (!isPlainObject(manifest.index)) {
    throw new Error("manifest.index must be an object");
  }

  assertString(manifest.index.title, "manifest.index.title");
  assertString(manifest.index.description, "manifest.index.description");
  if ("intro" in manifest.index) {
    assertStringArray(manifest.index.intro, "manifest.index.intro");
  }

  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    throw new Error("manifest.pages must be a non-empty array");
  }

  const seenIds = new Set();
  const seenOutputs = new Set();
  const normalizedPages = manifest.pages.map((page, index) => {
    const label = `manifest.pages[${index}]`;
    if (!isPlainObject(page)) {
      throw new Error(`${label} must be an object`);
    }

    const id = assertString(page.id, `${label}.id`);
    if (seenIds.has(id)) {
      throw new Error(`${label}.id duplicates ${id}`);
    }
    seenIds.add(id);

    const kind = assertString(page.kind, `${label}.kind`);
    if (!["run", "comparison"].includes(kind)) {
      throw new Error(`${label}.kind must be "run" or "comparison"`);
    }

    const section = assertString(page.section, `${label}.section`);
    const output = normalizeOutput(page.output, `${label}.output`);
    if (seenOutputs.has(output)) {
      throw new Error(`${label}.output duplicates ${output}`);
    }
    seenOutputs.add(output);

    const normalized = {
      id,
      kind,
      section,
      output,
      title: typeof page.title === "string" ? page.title : "",
      description: typeof page.description === "string" ? page.description : "",
      trackIds: Array.isArray(page.trackIds) ? page.trackIds.map((trackId, trackIndex) => assertString(trackId, `${label}.trackIds[${trackIndex}]`)) : [],
      resolutionMode: normalizeResolutionMode(page.resolutionMode, `${label}.resolutionMode`),
      snapshotPinnedAt: typeof page.snapshotPinnedAt === "string" ? page.snapshotPinnedAt : "",
    };

    if (kind === "run") {
      if ("inputs" in page || "preset" in page) {
        throw new Error(`${label} must not declare inputs or preset when kind is run`);
      }
      normalized.input = normalizeInputSpec(page.input, `${label}.input`);
      if ("snapshotInput" in page) {
        normalized.snapshotInput = normalizePinnedInputSpec(page.snapshotInput, `${label}.snapshotInput`);
      }
      return normalized;
    }

    if ("preset" in page) {
      normalized.preset = assertString(page.preset, `${label}.preset`);
    }
    if (normalized.preset && "inputs" in page) {
      throw new Error(`${label} cannot declare both preset and inputs`);
    }
    if (!normalized.preset) {
      if (!Array.isArray(page.inputs) || page.inputs.length === 0) {
        throw new Error(`${label}.inputs must be a non-empty array when preset is absent`);
      }
      normalized.inputs = page.inputs.map((entry, inputIndex) => normalizeInputSpec(entry, `${label}.inputs[${inputIndex}]`));
    }
    if ("snapshotInputs" in page) {
      if (!Array.isArray(page.snapshotInputs) || page.snapshotInputs.length === 0) {
        throw new Error(`${label}.snapshotInputs must be a non-empty array when present`);
      }
      normalized.snapshotInputs = page.snapshotInputs.map((entry, inputIndex) => normalizePinnedInputSpec(entry, `${label}.snapshotInputs[${inputIndex}]`));
    }
    return normalized;
  });

  return {
    index: manifest.index,
    pages: normalizedPages,
  };
}

async function listJsonFiles(rootDir) {
  const files = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

function catalogRecord(absolutePath, repoRoot, result) {
  return {
    absolutePath,
    relativePath: path.relative(repoRoot, absolutePath).replace(/\\/g, "/"),
    result,
    frameworkIds: [...new Set((result.results || []).map((entry) => entry.frameworkId).filter(Boolean))],
    trackIds: [...new Set((result.results || []).map((entry) => entry.track).filter(Boolean))],
    caseIds: [...new Set((result.results || []).map((entry) => entry.caseId).filter(Boolean))],
    generatedAtMs: Number(new Date(result.generatedAt || 0)),
  };
}

export async function buildValidatedResultCatalog(context, schema) {
  const jsonFiles = await listJsonFiles(context.benchmarkResultsRoot);
  const catalog = [];

  for (const filePath of jsonFiles) {
    try {
      const result = await readAndValidateJsonFile(filePath, schema);
      catalog.push(catalogRecord(filePath, context.repoRoot, result));
    } catch {
      // Ignore non-result JSON files such as environment sidecars.
    }
  }

  return catalog;
}

function resultMatchesSelector(record, selector) {
  if (selector.runner && record.result.runner !== selector.runner) {
    return false;
  }
  if (selector.runId && record.result.runId !== selector.runId) {
    return false;
  }
  if (selector.frameworkId && !record.frameworkIds.includes(selector.frameworkId)) {
    return false;
  }
  if (selector.trackId && !record.trackIds.includes(selector.trackId)) {
    return false;
  }
  if (selector.caseId && !record.caseIds.includes(selector.caseId)) {
    return false;
  }
  return true;
}

function baseInputSpecsForPage(page, label) {
  if (page.kind === "run") {
    return [page.input];
  }
  if (page.preset) {
    return expandPreset(page.preset, `${label}.preset`);
  }
  return page.inputs || [];
}

function activeInputSpecsForPage(page, label, options = {}) {
  if (page.resolutionMode === "snapshot" && !options.pinSnapshots) {
    const pinned = page.kind === "run" ? (page.snapshotInput ? [page.snapshotInput] : []) : (page.snapshotInputs || []);
    if (pinned.length === 0) {
      throw new Error(`${label} is snapshot-based but has no pinned inputs`);
    }
    return pinned;
  }
  return baseInputSpecsForPage(page, label);
}

function sortCatalogMatches(left, right) {
  if (right.generatedAtMs !== left.generatedAtMs) {
    return right.generatedAtMs - left.generatedAtMs;
  }
  if (left.result.runner === "matrix" && right.result.runner !== "matrix") {
    return -1;
  }
  if (right.result.runner === "matrix" && left.result.runner !== "matrix") {
    return 1;
  }
  return right.relativePath.localeCompare(left.relativePath);
}

function resolveSelectorInput(selector, catalog, label) {
  const matches = catalog.filter((record) => resultMatchesSelector(record, selector)).sort(sortCatalogMatches);
  if (matches.length === 0) {
    throw new Error(`${label} resolved to zero validated runs`);
  }
  if (matches.length > 1 && matches[0].generatedAtMs === matches[1].generatedAtMs && matches[0].result.runner === matches[1].result.runner) {
    throw new Error(`${label} resolved ambiguously between ${matches[0].relativePath} and ${matches[1].relativePath}`);
  }
  return {
    source: "selector",
    inputPath: matches[0].relativePath,
    absolutePath: matches[0].absolutePath,
    result: matches[0].result,
  };
}

async function resolvePathInput(relativePath, context, schema, catalog, label) {
  const absolutePath = path.resolve(context.repoRoot, relativePath);
  const cached = catalog.find((record) => record.absolutePath === absolutePath);
  if (cached) {
    return {
      source: "path",
      inputPath: cached.relativePath,
      absolutePath: cached.absolutePath,
      result: cached.result,
    };
  }

  try {
    const result = await readAndValidateJsonFile(absolutePath, schema);
    return {
      source: "path",
      inputPath: path.relative(context.repoRoot, absolutePath).replace(/\\/g, "/"),
      absolutePath,
      result,
    };
  } catch (error) {
    throw new Error(`${label} path failed validation: ${relativePath}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function resolveInputSpec(spec, context, schema, catalog, label) {
  if (spec.path) {
    return resolvePathInput(spec.path, context, schema, catalog, label);
  }
  return resolveSelectorInput(spec.selector, catalog, label);
}

export async function resolveManifestPages(manifest, context, schema, options = {}) {
  const normalizedManifest = validateManifestShape(manifest);
  const catalog = await buildValidatedResultCatalog(context, schema);
  const resolvedPages = [];

  for (const page of normalizedManifest.pages) {
    const label = `page ${page.id}`;
    if (page.kind === "run") {
      const [spec] = activeInputSpecsForPage(page, label, options);
      const input = await resolveInputSpec(spec, context, schema, catalog, label);
      resolvedPages.push({ ...page, input });
      continue;
    }

    const inputs = [];
    const seenPaths = new Set();
    const specs = activeInputSpecsForPage(page, label, options);
    for (let index = 0; index < specs.length; index += 1) {
      const resolved = await resolveInputSpec(specs[index], context, schema, catalog, `${label} input ${index}`);
      if (seenPaths.has(resolved.absolutePath)) {
        throw new Error(`${label} resolved duplicate input ${resolved.inputPath}`);
      }
      seenPaths.add(resolved.absolutePath);
      inputs.push(resolved);
    }
    resolvedPages.push({ ...page, inputs });
  }

  return {
    manifest: normalizedManifest,
    catalog,
    pages: resolvedPages,
  };
}

function serializeInputSpec(spec) {
  return spec.path ? { path: spec.path } : { selector: spec.selector };
}

function snapshotSpecFromResolved(resolved) {
  return { path: resolved.inputPath };
}

export async function writePinnedSnapshotManifest(normalizedManifest, resolvedPages, manifestAbsolutePath) {
  const pageMap = new Map(resolvedPages.map((page) => [page.id, page]));
  const pinnedAt = new Date().toISOString();
  const pages = normalizedManifest.pages.map((page) => {
    const resolved = pageMap.get(page.id);
    const output = {
      id: page.id,
      kind: page.kind,
      section: page.section,
      output: page.output,
    };

    if (page.title) {
      output.title = page.title;
    }
    if (page.description) {
      output.description = page.description;
    }
    if (page.trackIds.length > 0) {
      output.trackIds = [...page.trackIds];
    }
    if (page.resolutionMode !== "moving") {
      output.resolutionMode = page.resolutionMode;
    }

    if (page.kind === "run") {
      output.input = serializeInputSpec(page.input);
      if (page.resolutionMode === "snapshot" && resolved) {
        output.snapshotInput = snapshotSpecFromResolved(resolved.input);
        output.snapshotPinnedAt = pinnedAt;
      } else if (page.snapshotInput) {
        output.snapshotInput = serializeInputSpec(page.snapshotInput);
        if (page.snapshotPinnedAt) {
          output.snapshotPinnedAt = page.snapshotPinnedAt;
        }
      }
      return output;
    }

    if (page.preset) {
      output.preset = page.preset;
    } else {
      output.inputs = (page.inputs || []).map(serializeInputSpec);
    }
    if (page.resolutionMode === "snapshot" && resolved) {
      output.snapshotInputs = resolved.inputs.map(snapshotSpecFromResolved);
      output.snapshotPinnedAt = pinnedAt;
    } else if (page.snapshotInputs) {
      output.snapshotInputs = page.snapshotInputs.map(serializeInputSpec);
      if (page.snapshotPinnedAt) {
        output.snapshotPinnedAt = page.snapshotPinnedAt;
      }
    }
    return output;
  });

  const nextManifest = {
    index: normalizedManifest.index,
    pages,
  };
  await fs.writeFile(manifestAbsolutePath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
}
