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

const trackOrder = [
  "determinism", 
  "bundle-analysis", 
  "cold-build", 
  "dev-startup", 
  "hydration-runtime", 
  "rebuild", 
  "reactive-update"
];

const runnerScripts = {
  "determinism": "run-determinism.mjs",
  "bundle-analysis": "run-bundle-analysis.mjs",
  "cold-build": "run-cold-build.mjs",
  "dev-startup": "run-dev-startup.mjs",
  "hydration-runtime": "run-hydration.mjs",
  "rebuild": "run-rebuild.mjs",
  "reactive-update": "run-reactive-update.mjs",
};

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    const prefixMatch = process.argv.find(arg => arg.startsWith(`${name}=`));
    if (prefixMatch) {
      return prefixMatch.split("=")[1];
    }
    return "";
  }
  return process.argv[index + 1] || "";
}

function readTrackFilter() {
  const flag = readFlag("--track");
  if (!flag) return new Set();
  return new Set(
    flag
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
    // Check if any selected case supports this track
    return candidateCases.some((entry) => Array.isArray(entry.tracks) && entry.tracks.includes(trackId));
  });

  if (enabledTracks.length === 0) {
    throw new Error(`No benchmark tracks enabled for framework "${frameworkConfig.id}"`);
  }

  return enabledTracks;
}

function buildRunnerArgs(trackId, frameworkId, runId, caseId, options = {}) {
  const scriptName = runnerScripts[trackId];
  if (!scriptName) {
    throw new Error(`No runner registered for track "${trackId}"`);
  }

  const args = [join(benchmarksRoot, "scripts", scriptName), "--framework", frameworkId, "--run-id", runId];
  if (caseId) {
    args.push("--case", caseId);
  }
  if (options.profile) {
    args.push("--profile", options.profile);
  }
  if (options.saveBaseline && trackId === "determinism") {
    args.push("--save-baseline");
  }
  if (process.argv.includes("--ignore-filename-hashes") && trackId === "determinism") {
    args.push("--ignore-filename-hashes");
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

function detectRunnerFailureKind(result) {
  const stderr = String(result?.stderr || "").toLowerCase();
  const stdout = String(result?.stdout || "").toLowerCase();
  const err = String(result?.error || "").toLowerCase();
  if (
    String(result?.signal || "").toUpperCase() === "SIGTERM"
    || err.includes("timed out")
    || stderr.includes("timed out")
    || stdout.includes("timed out")
  ) {
    return "timeout";
  }
  return "runner-failed";
}

function validateTrackOutput(trackId, output) {
  const issues = [];
  const results = Array.isArray(output?.results) ? output.results : [];
  if (results.length === 0) {
    issues.push(`track ${trackId} emitted zero result rows`);
    return issues;
  }

  for (let i = 0; i < results.length; i += 1) {
    const row = results[i];
    if (!row || typeof row !== "object") {
      issues.push(`track ${trackId} emitted invalid row at index ${i}`);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(row, "status") && row.status !== "passed") {
      issues.push(`track ${trackId} row ${i} status=${row.status}`);
    }

    if (Array.isArray(row.samples)) {
      if (row.samples.length === 0) {
        issues.push(`track ${trackId} row ${i} has zero samples`);
      }
      for (let sampleIndex = 0; sampleIndex < row.samples.length; sampleIndex += 1) {
        const sample = row.samples[sampleIndex];
        if (sample && typeof sample === "object" && sample.status && sample.status !== "passed") {
          issues.push(`track ${trackId} row ${i} sample ${sampleIndex} status=${sample.status}`);
        }
      }
    }
  }

  return issues;
}

function isZenithFramework(frameworkId) {
  return frameworkId === "zenith";
}

function summarizeFailureDetail(value, maxLength = 240) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function classifyPublicationAssessment({ frameworkId, profile, childRuns }) {
  const publicationPolicy = {
    policyVersion: "phase12-zenith-hard-external-determinism-caveat-v1",
    benchmarkProfile: profile,
    zenithDeterminismGate: "hard-block",
    externalFrameworkDeterminismGate: "caveat-only",
  };

  const failedRuns = childRuns.filter((entry) => entry.status !== "passed");
  const blockingFailures = [];
  const caveats = [];
  const zenithFramework = isZenithFramework(frameworkId);
  const publicationProfile = profile === "publication";

  for (const failed of failedRuns) {
    const detail = failed.failureDetail || `${failed.runner} failed`;
    const descriptor = {
      runner: failed.runner,
      failureKind: failed.failureKind || "runner-failed",
      detail,
      detailSummary: summarizeFailureDetail(detail),
      stderrPath: failed.stderrPath || null,
    };

    const externalDeterminismFailure =
      publicationProfile &&
      !zenithFramework &&
      failed.runner === "determinism";

    if (externalDeterminismFailure) {
      caveats.push({
        ...descriptor,
        caveatType: "external-framework-determinism",
        publicationImpact: "non-blocking",
      });
      continue;
    }

    blockingFailures.push(descriptor);
  }

  const publicationStatus = blockingFailures.length === 0 ? "ready" : "blocked";
  return {
    publicationPolicy,
    publicationAssessment: {
      frameworkId,
      publicationStatus,
      blockingFailures,
      caveats,
    },
  };
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseId = readFlag("--case");
  const requestedRunId = readFlag("--run-id");
  const profile = readFlag("--profile") || "fast";
  const saveBaseline = process.argv.includes("--save-baseline");
  const requestedTracks = readTrackFilter();

  const runId = requestedRunId || createRunId("matrix");
  const environmentConfig = await loadEnvironmentConfig();
  const frameworksConfig = await loadFrameworksConfig();
  const matrixConfig = await loadMatrixConfig();
  const resultSchema = await loadResultSchema();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const enabledTracks = selectEnabledTracks(matrixConfig, frameworkConfig, caseId, requestedTracks);
  const { runDir, runnerDir } = await ensureRunPaths(runId, "matrix");

  console.log(`\n[Matrix] Starting run ${runId} for ${frameworkId}`);
  console.log(`[Matrix] profile: ${profile}, save-baseline: ${saveBaseline}`);
  console.log(`[Matrix] tracks: ${enabledTracks.join(", ")}`);

  const childRuns = [];
  const aggregatedResults = [];
  let baselineEnvironment = null;

  for (const trackId of enabledTracks) {
    console.log(`\n[Matrix] -> Running track: ${trackId}`);
    
    const stdoutPath = join(runnerDir, `${trackId}.stdout.log`);
    const stderrPath = join(runnerDir, `${trackId}.stderr.log`);
    const startedAt = performance.now();
    
    const result = runCommand(process.execPath, buildRunnerArgs(trackId, frameworkId, runId, caseId, { profile, saveBaseline }), {
      cwd: benchmarksRoot,
      env: process.env,
    });
    const durationMs = Number((performance.now() - startedAt).toFixed(2));

    await writeText(stdoutPath, result.stdout || "");
    await writeText(stderrPath, result.stderr || "");

    const outputPath = join(runDir, `${trackId}.json`);
    const baseChildRun = {
      runner: trackId,
      outputPath,
      stdoutPath,
      stderrPath,
      durationMs,
      resultCount: 0,
      validated: false,
    };

    if (result.status !== 0) {
      console.error(`[Matrix] Runner failed for ${trackId}:\n${result.stderr || result.stdout}`);
      const failureKind = detectRunnerFailureKind(result);
      childRuns.push({
        ...baseChildRun,
        status: "failed",
        failureKind,
        failureDetail: result.error || result.stderr || result.stdout || `exit=${result.status}`,
      });
      continue;
    }

    try {
      const output = await readAndValidateJsonFile(outputPath, resultSchema);
      ensureRunnerShape(trackId, runId, output);
      const validationIssues = validateTrackOutput(trackId, output);
      if (validationIssues.length > 0) {
        const issueText = validationIssues.join("; ");
        console.error(`[Matrix] Track validation failed for ${trackId}: ${issueText}`);
        childRuns.push({
          ...baseChildRun,
          status: "failed",
          failureKind: "invalid-output",
          failureDetail: issueText,
        });
        continue;
      }

      baselineEnvironment = baselineEnvironment || output.environment;
      aggregatedResults.push(...(output.results || []));
      childRuns.push({
        ...baseChildRun,
        status: "passed",
        resultCount: Array.isArray(output.results) ? output.results.length : 0,
        validated: true,
      });
    } catch (e) {
      console.error(`[Matrix] Failed to validate/read output for ${trackId}: ${e.message}`);
      childRuns.push({
        ...baseChildRun,
        status: "failed",
        failureKind: "schema-or-read",
        failureDetail: e.message,
      });
    }
  }

  const { publicationPolicy, publicationAssessment } = classifyPublicationAssessment({
    frameworkId,
    profile,
    childRuns,
  });

  const matrixOutput = {
    schemaVersion: 1,
    runner: "matrix",
    runId,
    benchmark_profile: profile,
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
    publication_policy: publicationPolicy,
    publication_assessment: publicationAssessment,
  };

  const matrixPath = join(runDir, "matrix.json");
  await writeJson(matrixPath, matrixOutput);
  assertValidSchemaValue(resultSchema, matrixOutput, matrixPath);
  
  console.log(`\n[Matrix] Complete. Aggregated results at: ${matrixPath}`);
  if (publicationAssessment.caveats.length > 0) {
    console.warn(
      `[Matrix] Non-blocking publication caveats for ${frameworkId}: ${
        publicationAssessment.caveats.map((entry) => `${entry.runner}: ${entry.failureKind}`).join(", ")
      }`,
    );
  }
  if (publicationAssessment.blockingFailures.length > 0) {
    throw new Error(
      `Matrix run failed due to track failures: ${
        publicationAssessment.blockingFailures
          .map((entry) => `${entry.runner}: ${entry.failureKind}`)
          .join(", ")
      }`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
