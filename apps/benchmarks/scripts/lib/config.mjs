import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const benchmarksRoot = resolve(__dirname, "../..");
export const repoRoot = resolve(benchmarksRoot, "../..");
export const configRoot = join(benchmarksRoot, "config");
export const resultsRoot = join(benchmarksRoot, "results");

async function readJson(relativePath) {
  const filePath = join(configRoot, relativePath);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function loadMatrixConfig() {
  return readJson("matrix.json");
}

export async function loadFrameworksConfig() {
  return readJson("frameworks.json");
}

export async function loadEnvironmentConfig() {
  return readJson("environment.json");
}

export async function loadResultSchema() {
  return readJson("result-schema.json");
}

export function getFrameworkConfig(frameworksConfig, frameworkId) {
  const entry = (frameworksConfig.frameworks || []).find((framework) => framework.id === frameworkId);
  if (!entry) {
    throw new Error(`Unknown framework id: ${frameworkId}`);
  }
  return entry;
}

export function resolveFixtureDir(caseConfig, frameworkConfig) {
  return join(benchmarksRoot, caseConfig.fixtureBaseDir, frameworkConfig.fixtureSubdir);
}

export function selectCases(matrixConfig, trackId, filters = {}) {
  const selected = (matrixConfig.cases || []).filter((entry) => {
    if (!Array.isArray(entry.tracks) || !entry.tracks.includes(trackId)) {
      return false;
    }
    if (Array.isArray(filters.supportedTracks) && !filters.supportedTracks.includes(trackId)) {
      return false;
    }
    if (filters.caseId && entry.id !== filters.caseId) {
      return false;
    }
    if (filters.frameworkId && (!Array.isArray(entry.frameworkIds) || !entry.frameworkIds.includes(filters.frameworkId))) {
      return false;
    }
    return true;
  });

  if (selected.length === 0) {
    throw new Error(`No benchmark cases selected for track "${trackId}"`);
  }

  return selected;
}
