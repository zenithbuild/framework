import { performance } from "node:perf_hooks";
import { join } from "node:path";
import {
  getFrameworkConfig,
  loadEnvironmentConfig,
  loadFrameworksConfig,
  loadMatrixConfig,
  resolveFixtureDir,
  selectCases,
} from "./lib/config.mjs";
import {
  interpolateArgs,
  removeFixturePaths,
  resolveBuildArtifactPaths,
  resolveCleanPaths,
} from "./lib/dev-state.mjs";
import { captureEnvironmentMetadata } from "./lib/environment.mjs";
import { runCommand } from "./lib/process.mjs";
import {
  collectBuildArtifacts,
  createRunId,
  ensureRunPaths,
  parseZenithStartupEvents,
  sanitizeSegment,
  summarizeSamples,
  writeJson,
  writeText,
} from "./lib/results.mjs";

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    // Check for --flag=value format
    const prefixMatch = process.argv.find(arg => arg.startsWith(`${name}=`));
    if (prefixMatch) {
      return prefixMatch.split("=")[1];
    }
    return "";
  }
  return process.argv[index + 1] || "";
}

async function runInstallStep(frameworkConfig, fixtureDir, cellDir, timeoutMs) {
  const [command, ...args] = frameworkConfig.commands.install;
  const startedAt = performance.now();
  const result = runCommand(command, args, {
    cwd: fixtureDir,
    env: { ...process.env, ...frameworkConfig.env },
    timeoutMs,
  });
  const durationMs = Number((performance.now() - startedAt).toFixed(2));

  await writeText(join(cellDir, "install.stdout.log"), result.stdout);
  await writeText(join(cellDir, "install.stderr.log"), result.stderr);

  if (result.status !== 0) {
    throw new Error(`Install failed in ${fixtureDir}\n${result.stderr}`);
  }

  return {
    status: "passed",
    durationMs,
    stdoutPath: join(cellDir, "install.stdout.log"),
    stderrPath: join(cellDir, "install.stderr.log"),
  };
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseId = readFlag("--case");
  const requestedRunId = readFlag("--run-id");
  const profile = readFlag("--profile") || "fast";

  const environmentConfig = await loadEnvironmentConfig();
  const frameworksConfig = await loadFrameworksConfig();
  const matrixConfig = await loadMatrixConfig();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const selectedCases = selectCases(matrixConfig, "cold-build", {
    frameworkId,
    caseId,
    supportedTracks: frameworkConfig.supportedTracks,
  });
  const cleanPaths = resolveCleanPaths(environmentConfig, frameworkConfig);
  const buildArtifactPaths = resolveBuildArtifactPaths(frameworkConfig);

  // Profile overrides
  let warmupCount = environmentConfig.warmupCount;
  let sampleCount = environmentConfig.sampleCount;

  if (profile === "fast") {
    warmupCount = 1;
    sampleCount = 2;
  } else if (profile === "publication") {
    warmupCount = 1;
    sampleCount = 5;
  }

  const runId = requestedRunId || createRunId("cold-build");
  const { runDir, runnerDir } = await ensureRunPaths(runId, "cold-build");
  const fixtureDirs = selectedCases.map((entry) => ({
    caseId: entry.id,
    frameworkId,
    fixtureDir: resolveFixtureDir(entry, frameworkConfig),
  }));
  
  const environment = await captureEnvironmentMetadata({
    host: environmentConfig.host,
    warmupCount,
    sampleCount,
    fixtureDirs,
  });

  await writeJson(join(runDir, "environment.json"), environment);

  const results = [];

  for (const caseConfig of selectedCases) {
    const fixtureDir = resolveFixtureDir(caseConfig, frameworkConfig);
    const cellDir = join(runnerDir, `${sanitizeSegment(caseConfig.id)}__${sanitizeSegment(frameworkId)}`);
    const install = await runInstallStep(
      frameworkConfig,
      fixtureDir,
      cellDir,
      environmentConfig.installTimeoutMs,
    );
    const samples = [];

    console.log(`\n[Cold Build] ${caseConfig.id} (${frameworkId}) [Profile: ${profile}]`);

    for (let index = 0; index < warmupCount + sampleCount; index += 1) {
      const isWarmup = index < warmupCount;
      const sampleLabel = isWarmup ? `warmup-${index + 1}` : `sample-${index + 1 - warmupCount}`;
      console.log(`  ${sampleLabel}...`);
      
      await removeFixturePaths(fixtureDir, cleanPaths);

      const [command, ...args] = interpolateArgs(frameworkConfig.commands.build, {});
      const startedAt = performance.now();
      const result = runCommand(command, args, {
        cwd: fixtureDir,
        env: { ...process.env, ...frameworkConfig.env },
        timeoutMs: environmentConfig.buildTimeoutMs,
      });
      const durationMs = Number((performance.now() - startedAt).toFixed(2));
      const startupEvents = parseZenithStartupEvents(result.stderr);
      const artifactStats = await collectBuildArtifacts(fixtureDir, buildArtifactPaths);
      const distStats = {
        exists: artifactStats.exists,
        fileCount: artifactStats.fileCount,
        totalBytes: artifactStats.totalBytes,
      };
      
      const stdoutPath = join(cellDir, `${sampleLabel}.stdout.log`);
      const stderrPath = join(cellDir, `${sampleLabel}.stderr.log`);
      const startupProfilePath = join(cellDir, `${sampleLabel}.startup-profile.json`);
      const distSizePath = join(cellDir, `${sampleLabel}.dist-size.json`);

      await writeText(stdoutPath, result.stdout);
      await writeText(stderrPath, result.stderr);
      await writeJson(startupProfilePath, startupEvents);
      await writeJson(distSizePath, artifactStats);

      if (result.status !== 0) {
        throw new Error(`Cold build failed for ${caseConfig.id}\n${result.stderr}`);
      }

      if (!isWarmup) {
        samples.push({
          label: sampleLabel,
          status: "passed",
          durationMs,
          exitCode: result.status,
          stdoutPath,
          stderrPath,
          startupProfilePath,
          distSizePath,
          startupEventCount: startupEvents.length,
          dist: distStats,
        });
      }
    }

    results.push({
      frameworkId,
      framework_kind: frameworkConfig.kind || frameworkId.split("-")[0],
      caseId: caseConfig.id,
      track: "cold-build",
      benchmark_profile: profile,
      fixtureDir,
      install,
      warmupCount,
      sampleCount,
      samples,
      summary: summarizeSamples(samples),
    });
  }

  const output = {
    schemaVersion: 1,
    runner: "cold-build",
    runId,
    benchmark_profile: profile,
    generatedAt: new Date().toISOString(),
    environment,
    results,
  };

  const outputPath = join(runDir, "cold-build.json");
  await writeJson(outputPath, output);
  console.log(`\nResults written to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
