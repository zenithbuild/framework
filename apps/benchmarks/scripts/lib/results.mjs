import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resultsRoot } from "./config.mjs";

export function createRunId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${stamp}-${prefix}`;
}

export function sanitizeSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureRunPaths(runId, runnerName) {
  const runDir = join(resultsRoot, runId);
  const runnerDir = join(runDir, runnerName);
  await mkdir(runnerDir, { recursive: true });
  return { runDir, runnerDir };
}

export async function ensureBaselinePath() {
  const baselineDir = join(resultsRoot, "baselines");
  await mkdir(baselineDir, { recursive: true });
  return baselineDir;
}

export async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

export function parseZenithStartupEvents(stderr) {
  const lines = String(stderr || "").split("\n");
  const events = [];

  for (const line of lines) {
    if (!line.startsWith("[zenith-startup] ")) {
      continue;
    }

    try {
      events.push(JSON.parse(line.slice("[zenith-startup] ".length)));
    } catch {
      // Keep raw stderr on disk even if one event line fails to parse.
    }
  }

  return events;
}

export async function collectDirectoryStats(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    let fileCount = 0;
    let totalBytes = 0;

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectDirectoryStats(fullPath);
        fileCount += nested.fileCount;
        totalBytes += nested.totalBytes;
        continue;
      }

      const entryStat = await stat(fullPath);
      fileCount += 1;
      totalBytes += entryStat.size;
    }

    return {
      exists: true,
      fileCount,
      totalBytes,
    };
  } catch {
    return {
      exists: false,
      fileCount: 0,
      totalBytes: 0,
    };
  }
}

export async function collectBuildArtifacts(rootDir, relativePaths) {
  const artifacts = [];
  let fileCount = 0;
  let totalBytes = 0;
  let exists = false;

  for (const relativePath of relativePaths) {
    const stats = await collectDirectoryStats(join(rootDir, relativePath));
    artifacts.push({
      relativePath,
      ...stats,
    });
    if (stats.exists) {
      exists = true;
    }
    fileCount += stats.fileCount;
    totalBytes += stats.totalBytes;
  }

  return {
    exists,
    fileCount,
    totalBytes,
    artifacts,
  };
}

export function summarizeSamples(samples) {
  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  if (durations.length === 0) {
    return { status: "failed", minMs: 0, maxMs: 0, medianMs: 0, p95Ms: 0 };
  }

  const minMs = durations[0];
  const maxMs = durations[durations.length - 1];
  const middle = Math.floor(durations.length / 2);
  const medianMs = durations.length % 2 === 0
    ? Number(((durations[middle - 1] + durations[middle]) / 2).toFixed(2))
    : durations[middle];

  // P95 calculation
  const p95Index = Math.ceil(durations.length * 0.95) - 1;
  const p95Ms = durations[Math.max(0, p95Index)];

  return {
    status: samples.every((sample) => sample.status === "passed") ? "passed" : "failed",
    minMs,
    maxMs,
    medianMs,
    p95Ms,
  };
}

export async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}
