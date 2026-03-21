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
  resolveCleanPaths,
  waitForReadyState,
} from "./lib/dev-state.mjs";
import { captureEnvironmentMetadata } from "./lib/environment.mjs";
import { getFreePort, runCommand, startCommand } from "./lib/process.mjs";
import {
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

  const environmentConfig = await loadEnvironmentConfig();
  const frameworksConfig = await loadFrameworksConfig();
  const matrixConfig = await loadMatrixConfig();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const selectedCases = selectCases(matrixConfig, "dev-startup", {
    frameworkId,
    caseId,
    supportedTracks: frameworkConfig.supportedTracks,
  });
  const cleanPaths = resolveCleanPaths(environmentConfig, frameworkConfig);

  const runId = requestedRunId || createRunId("dev-startup");
  const { runDir, runnerDir } = await ensureRunPaths(runId, "dev-startup");
  const fixtureDirs = selectedCases.map((entry) => ({
    caseId: entry.id,
    frameworkId,
    fixtureDir: resolveFixtureDir(entry, frameworkConfig),
  }));
  const environment = await captureEnvironmentMetadata({
    host: environmentConfig.host,
    warmupCount: environmentConfig.warmupCount,
    sampleCount: environmentConfig.sampleCount,
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

    for (let index = 0; index < environmentConfig.warmupCount + environmentConfig.sampleCount; index += 1) {
      const isWarmup = index < environmentConfig.warmupCount;
      const sampleLabel = isWarmup ? `warmup-${index + 1}` : `sample-${index + 1 - environmentConfig.warmupCount}`;
      await removeFixturePaths(fixtureDir, cleanPaths);

      const port = await getFreePort();
      const [command, ...args] = interpolateArgs(frameworkConfig.commands.dev, { port });
      const processHandle = startCommand(command, args, {
        cwd: fixtureDir,
        env: { ...process.env, ...frameworkConfig.env },
      });
      const origin = `http://${environmentConfig.host}:${port}`;
      const stateUrl = `${origin}${frameworkConfig.readyProbe.path}`;
      const routeUrl = `${origin}${caseConfig.startupPath}`;
      const startedAt = performance.now();

      try {
        const ready = await waitForReadyState(stateUrl, frameworkConfig, environmentConfig);
        const readyResponse = ready.response;
        const readyState = ready.state;
        const durationMs = Number((performance.now() - startedAt).toFixed(2));
        const routeResponse = await fetch(routeUrl);
        const logs = processHandle.logs();
        const startupEvents = parseZenithStartupEvents(logs.stderr);
        const stdoutPath = join(cellDir, `${sampleLabel}.stdout.log`);
        const stderrPath = join(cellDir, `${sampleLabel}.stderr.log`);
        const startupProfilePath = join(cellDir, `${sampleLabel}.startup-profile.json`);
        const readyStatePath = join(cellDir, `${sampleLabel}.ready-state.json`);

        await writeText(stdoutPath, logs.stdout);
        await writeText(stderrPath, logs.stderr);
        await writeJson(startupProfilePath, startupEvents);
        await writeJson(readyStatePath, readyState);

        if (readyState.status !== frameworkConfig.readyProbe.expectStateStatus) {
          throw new Error(`Unexpected dev state for ${caseConfig.id}: ${JSON.stringify(readyState)}`);
        }

        if (routeResponse.status !== 200) {
          throw new Error(`Route probe failed for ${caseConfig.id}: ${routeResponse.status}`);
        }

        if (!isWarmup) {
          samples.push({
            label: sampleLabel,
            status: "passed",
            durationMs,
            stdoutPath,
            stderrPath,
            startupProfilePath,
            readyStatePath,
            startupEventCount: startupEvents.length,
            readyProbe: {
              url: stateUrl,
              status: readyResponse.status,
              buildStatus: readyState.status,
            },
            routeProbe: {
              url: routeUrl,
              status: routeResponse.status,
            },
          });
        }
      } finally {
        await processHandle.stop(environmentConfig.shutdownTimeoutMs);
      }
    }

    results.push({
      frameworkId,
      caseId: caseConfig.id,
      track: "dev-startup",
      fixtureDir,
      install,
      warmupCount: environmentConfig.warmupCount,
      sampleCount: environmentConfig.sampleCount,
      samples,
      summary: summarizeSamples(samples),
    });
  }

  const output = {
    schemaVersion: 1,
    runner: "dev-startup",
    runId,
    generatedAt: new Date().toISOString(),
    environment,
    results,
  };

  const outputPath = join(runDir, "dev-startup.json");
  await writeJson(outputPath, output);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
