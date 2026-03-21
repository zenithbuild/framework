import { performance } from "node:perf_hooks";
import { join } from "node:path";
import {
  benchmarksRoot,
  configRoot,
  loadEnvironmentConfig,
  loadFrameworksConfig,
  loadMatrixConfig,
  loadResultSchema,
  getFrameworkConfig,
} from "./lib/config.mjs";
import { runCommand } from "./lib/process.mjs";
import { createRunId, ensureRunPaths, writeJson, writeText } from "./lib/results.mjs";
import { assertValidSchemaValue, readAndValidateJsonFile } from "./lib/schema.mjs";

const trackOrder = ["cold-build", "dev-startup", "hydration-runtime", "rebuild"];
const runnerScripts = {
  "cold-build": "run-cold-build.mjs",
  "dev-startup": "run-dev-startup.mjs",
  "hydration-runtime": "run-hydration.mjs",
  rebuild: "run-rebuild.mjs",
};

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1] || "";
}

function readTrackFilter() {
  return new Set(
    readFlag("--track")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function selectEnabledTracks(matrixConfig, frameworkConfig, caseId, requestedTracks) {
  const candidateCases = (matrixConfig.cases || []).filter((entry) => {
    if (caseId && entry.id !== caseId) {
      return false;
    }
    return Array.isArray(entry.frameworkIds) && entry.frameworkIds.includes(frameworkConfig.id);
  });

  if (candidateCases.length === 0) {
    throw new Error(`No benchmark cases selected for framework "${frameworkConfig.id}"`);
  }

  const enabledTracks = trackOrder.filter((trackId) => {
    if (requestedTracks.size > 0 && !requestedTracks.has(trackId)) {
      return false;
    }
    if (Array.isArray(frameworkConfig.supportedTracks) && !frameworkConfig.supportedTracks.includes(trackId)) {
      return false;
    }
    return candidateCases.some((entry) => Array.isArray(entry.tracks) && entry.tracks.includes(trackId));
  });

  if (enabledTracks.length === 0) {
    throw new Error(`No benchmark tracks enabled for framework "${frameworkConfig.id}"`);
  }

  return enabledTracks;
}

function buildRunnerArgs(trackId, frameworkId, runId, caseId) {
  const scriptName = runnerScripts[trackId];
  if (!scriptName) {
    throw new Error(`No runner registered for track "${trackId}"`);
  }

  const args = [join(benchmarksRoot, "scripts", scriptName), "--framework", frameworkId, "--run-id", runId];
  if (caseId) {
    args.push("--case", caseId);
  }
  return args;
}

function ensureRunnerShape(trackId, runId, output) {
  if (output.runner !== trackId) {
    throw new Error(`Runner output mismatch for ${trackId}: expected runner "${trackId}", received "${output.runner}"`);
  }
  if (output.runId !== runId) {
    throw new Error(`Runner output mismatch for ${trackId}: expected runId "${runId}", received "${output.runId}"`);
  }
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseId = readFlag("--case");
  const requestedRunId = readFlag("--run-id");
  const requestedTracks = readTrackFilter();

  const runId = requestedRunId || createRunId("matrix");
  const environmentConfig = await loadEnvironmentConfig();
  const frameworksConfig = await loadFrameworksConfig();
  const matrixConfig = await loadMatrixConfig();
  const resultSchema = await loadResultSchema();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const enabledTracks = selectEnabledTracks(matrixConfig, frameworkConfig, caseId, requestedTracks);
  const { runDir, runnerDir } = await ensureRunPaths(runId, "matrix");

  const childRuns = [];
  const aggregatedResults = [];
  let baselineEnvironment = null;

  for (const trackId of enabledTracks) {
    const stdoutPath = join(runnerDir, `${trackId}.stdout.log`);
    const stderrPath = join(runnerDir, `${trackId}.stderr.log`);
    const startedAt = performance.now();
    const result = runCommand(process.execPath, buildRunnerArgs(trackId, frameworkId, runId, caseId), {
      cwd: benchmarksRoot,
      env: process.env,
    });
    const durationMs = Number((performance.now() - startedAt).toFixed(2));

    await writeText(stdoutPath, result.stdout);
    await writeText(stderrPath, result.stderr);

    if (result.status !== 0) {
      throw new Error(`Runner failed for ${trackId}\n${result.stderr || result.stdout}`);
    }

    const outputPath = join(runDir, `${trackId}.json`);
    const output = await readAndValidateJsonFile(outputPath, resultSchema);
    ensureRunnerShape(trackId, runId, output);

    baselineEnvironment = baselineEnvironment || output.environment;
    aggregatedResults.push(...(output.results || []));
    childRuns.push({
      runner: trackId,
      outputPath,
      stdoutPath,
      stderrPath,
      durationMs,
      resultCount: Array.isArray(output.results) ? output.results.length : 0,
      validated: true,
    });
  }

  const matrixOutput = {
    schemaVersion: 1,
    runner: "matrix",
    runId,
    generatedAt: new Date().toISOString(),
    environment: {
      ...(baselineEnvironment || {}),
      orchestrator: {
        frameworkId,
        caseId: caseId || null,
        enabledTracks,
        schemaPath: join(configRoot, "result-schema.json"),
        trackOrder,
        warmupCount: environmentConfig.warmupCount,
        sampleCount: environmentConfig.sampleCount,
      },
    },
    results: aggregatedResults,
    childRuns,
  };

  const matrixPath = join(runDir, "matrix.json");
  await writeJson(matrixPath, matrixOutput);
  assertValidSchemaValue(resultSchema, matrixOutput, matrixPath);
  console.log(matrixPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
