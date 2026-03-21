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
  createLogCheckpoint,
  interpolateArgs,
  probeRoute,
  readLogDelta,
  removeFixturePaths,
  resolveCleanPaths,
  waitForNextBuildState,
  waitForReadyState,
} from "./lib/dev-state.mjs";
import { launchRuntimeBrowser } from "./lib/browser-runtime.mjs";
import { captureEnvironmentMetadata } from "./lib/environment.mjs";
import { buildRebuildMeasurementContract } from "./lib/measurement-contracts.mjs";
import { prepareCaseMutations, applyPreparedMutation, restorePreparedMutation } from "./lib/mutations.mjs";
import { createRebuildProbeSession, waitForBrowserProbe } from "./lib/rebuild-probe.mjs";
import { getFreePort, runCommand, startCommand } from "./lib/process.mjs";
import {
  createRunId,
  ensureRunPaths,
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

async function waitForSettledMutation({
  caseId,
  currentState,
  devEventSession,
  environmentConfig,
  frameworkConfig,
  page,
  probeChecks,
  routeUrl,
  sampleLabel,
  stateUrl,
}) {
  const settleMode = frameworkConfig.rebuildSettle?.mode || "browser-probe";
  if (settleMode === "dev-state") {
    const settled = devEventSession
      ? await devEventSession.waitForBuildResult(Number.isInteger(currentState.buildId) ? currentState.buildId : -1)
      : await waitForNextBuildState(
        stateUrl,
        frameworkConfig,
        environmentConfig,
        Number.isInteger(currentState.buildId) ? currentState.buildId : -1,
      );
    return {
      state: devEventSession ? settled : settled.state,
      routeProbe: await probeRoute(routeUrl, caseId, frameworkConfig),
      browserProbe: null,
      settleMode,
    };
  }

  if (settleMode !== "browser-probe") {
    throw new Error(`Unsupported rebuild settle mode "${settleMode}" for ${frameworkConfig.id || "framework"}`);
  }
  if (!page) {
    throw new Error(`Browser probe session missing for ${frameworkConfig.id || "framework"}`);
  }

  const browserProbe = await waitForBrowserProbe({
    page,
    routeUrl,
    probe: probeChecks,
    environmentConfig,
    sampleLabel,
  });

  return {
    state: currentState,
    routeProbe: browserProbe.routeProbe,
    browserProbe,
    settleMode,
  };
}

async function runMutationSample({
  caseConfig,
  frameworkConfig,
  environmentConfig,
  browserSession,
  processHandle,
  stateUrl,
  routeUrl,
  devEventSession,
  mutation,
  currentState,
  mutationDir,
  sampleLabel,
}) {
  const stdoutPath = join(mutationDir, `${sampleLabel}.stdout.log`);
  const stderrPath = join(mutationDir, `${sampleLabel}.stderr.log`);
  const mutationPath = join(mutationDir, `${sampleLabel}.mutation.json`);
  const restorePath = join(mutationDir, `${sampleLabel}.restore.json`);
  const restoreStdoutPath = join(mutationDir, `${sampleLabel}.restore.stdout.log`);
  const restoreStderrPath = join(mutationDir, `${sampleLabel}.restore.stderr.log`);
  const browserProbePath = join(mutationDir, `${sampleLabel}.browser-probe.json`);
  const restoreBrowserProbePath = join(mutationDir, `${sampleLabel}.restore.browser-probe.json`);

  const mutationCheckpoint = createLogCheckpoint(processHandle);
  let mutationMetadata = null;
  let rebuildState = currentState;
  let routeProbe = null;
  let browserProbe = null;
  let settleMode = frameworkConfig.rebuildSettle?.mode || "browser-probe";
  let durationMs = 0;
  let mutationError = null;

  try {
    const startedAt = performance.now();
    mutationMetadata = await applyPreparedMutation(mutation, sampleLabel);
    await writeJson(mutationPath, mutationMetadata);

    const settled = await waitForSettledMutation({
      currentState,
      devEventSession,
      environmentConfig,
      frameworkConfig,
      caseId: caseConfig.id,
      page: browserSession ? browserSession.page : null,
      probeChecks: mutation.browserProbe.mutate,
      routeUrl,
      sampleLabel,
      stateUrl,
    });
    durationMs = Number((performance.now() - startedAt).toFixed(2));
    rebuildState = settled.state;
    settleMode = settled.settleMode;
    routeProbe = settled.routeProbe;
    browserProbe = settled.browserProbe;
    if (browserProbe) {
      await writeJson(browserProbePath, browserProbe);
    }
  } catch (error) {
    mutationError = error;
  } finally {
    const mutationLogs = readLogDelta(processHandle, mutationCheckpoint);
    await writeText(stdoutPath, mutationLogs.stdout);
    await writeText(stderrPath, mutationLogs.stderr);
  }

  let restoreMetadata = null;
  let restoreState = rebuildState;
  let restoreBrowserProbe = null;
  let restoreDurationMs = 0;

  if (mutationMetadata) {
    const restoreCheckpoint = createLogCheckpoint(processHandle);

    try {
      const startedAt = performance.now();
      restoreMetadata = await restorePreparedMutation(mutation);
      const settled = await waitForSettledMutation({
        currentState: rebuildState,
        devEventSession,
        environmentConfig,
        frameworkConfig,
        caseId: caseConfig.id,
        page: browserSession ? browserSession.page : null,
        probeChecks: mutation.browserProbe.restore,
        routeUrl,
        sampleLabel: `${sampleLabel}-restore`,
        stateUrl,
      });
      restoreDurationMs = Number((performance.now() - startedAt).toFixed(2));
      restoreState = settled.state;
      const restoreRouteProbe = settled.routeProbe;
      restoreBrowserProbe = settled.browserProbe;
      if (restoreBrowserProbe) {
        await writeJson(restoreBrowserProbePath, restoreBrowserProbe);
      }

      restoreMetadata = {
        ...restoreMetadata,
        durationMs: restoreDurationMs,
        buildId: restoreState.buildId,
        buildStatus: restoreState.status,
        routeProbe: restoreRouteProbe,
        status: restoreMetadata.contentMatchesOriginal ? "passed" : "failed",
      };
      await writeJson(restorePath, restoreMetadata);
    } finally {
      const restoreLogs = readLogDelta(processHandle, restoreCheckpoint);
      await writeText(restoreStdoutPath, restoreLogs.stdout);
      await writeText(restoreStderrPath, restoreLogs.stderr);
    }
  }

  if (mutationError) {
    throw mutationError;
  }

  if (!restoreMetadata || !restoreMetadata.contentMatchesOriginal) {
    throw new Error(`Restore verification failed for ${mutation.targetPath}`);
  }

  return {
    nextState: restoreState,
    sample: {
      label: sampleLabel,
      status: "passed",
      durationMs,
      stdoutPath,
      stderrPath,
      mutationPath,
      browserProbePath: browserProbe ? browserProbePath : null,
      settleMode,
      mutationTrack: mutation.id,
      mutation: {
        label: mutation.label,
        targetPath: mutation.targetPath,
        targetRelativePath: mutation.targetRelativePath,
        originalSha256: mutationMetadata.originalSha256,
        mutatedSha256: mutationMetadata.mutatedSha256,
      },
      rebuildState: {
        buildId: rebuildState.buildId,
        status: rebuildState.status,
      },
      routeProbe,
      browserProbe: {
        finalChecks: browserProbe ? browserProbe.finalChecks : [],
      },
      restore: {
        status: restoreMetadata.status,
        durationMs: restoreDurationMs,
        metadataPath: restorePath,
        browserProbePath: restoreBrowserProbe ? restoreBrowserProbePath : null,
        stdoutPath: restoreStdoutPath,
        stderrPath: restoreStderrPath,
        buildId: restoreState.buildId,
        buildStatus: restoreState.status,
        contentMatchesOriginal: restoreMetadata.contentMatchesOriginal,
        finalChecks: restoreBrowserProbe ? restoreBrowserProbe.finalChecks : [],
      },
    },
  };
}

async function runMutationTrack({
  caseConfig,
  frameworkId,
  frameworkConfig,
  environmentConfig,
  measurementContract,
  fixtureDir,
  cleanPaths,
  caseDir,
  install,
  mutation,
  browser,
}) {
  const mutationDir = join(caseDir, sanitizeSegment(mutation.id));
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
  const needsBrowserProbe = (frameworkConfig.rebuildSettle?.mode || "browser-probe") === "browser-probe";
  const browserSession = needsBrowserProbe ? await createRebuildProbeSession(browser, environmentConfig) : null;
  const devEventSession = null;

  try {
    const ready = await waitForReadyState(stateUrl, frameworkConfig, environmentConfig);
    let currentState = ready.state;
    const initialRouteProbe = await probeRoute(routeUrl, caseConfig.id, frameworkConfig);
    await writeJson(join(mutationDir, "session.ready-state.json"), ready.state);

    const samples = [];

    for (let index = 0; index < environmentConfig.warmupCount + environmentConfig.sampleCount; index += 1) {
      const isWarmup = index < environmentConfig.warmupCount;
      const sampleLabel = isWarmup ? `warmup-${index + 1}` : `sample-${index + 1 - environmentConfig.warmupCount}`;
      const outcome = await runMutationSample({
        caseConfig,
        frameworkConfig,
        environmentConfig,
        browserSession,
        processHandle,
        stateUrl,
        routeUrl,
        devEventSession,
        mutation,
        currentState,
        mutationDir,
        sampleLabel,
      });
      currentState = outcome.nextState;

      if (!isWarmup) {
        samples.push(outcome.sample);
      }
    }

    return {
      frameworkId,
      caseId: caseConfig.id,
      track: "rebuild",
      mutationTrack: mutation.id,
      measurementContract,
      fixtureDir,
      install,
      warmupCount: environmentConfig.warmupCount,
      sampleCount: environmentConfig.sampleCount,
      session: {
        origin,
        stateUrl,
        routeUrl,
        rebuildSettleMode: frameworkConfig.rebuildSettle?.mode || "browser-probe",
        initialBuildId: ready.state.buildId,
        initialStatus: ready.state.status,
        initialRouteProbe,
      },
      samples,
      summary: summarizeSamples(samples),
    };
  } finally {
    if (devEventSession) {
      await devEventSession.close();
    }
    if (browserSession) {
      await browserSession.close();
    }
    await processHandle.stop(environmentConfig.shutdownTimeoutMs);
  }
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseId = readFlag("--case");
  const requestedRunId = readFlag("--run-id");

  const environmentConfig = await loadEnvironmentConfig();
  const frameworksConfig = await loadFrameworksConfig();
  const matrixConfig = await loadMatrixConfig();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const selectedCases = selectCases(matrixConfig, "rebuild", {
    frameworkId,
    caseId,
    supportedTracks: frameworkConfig.supportedTracks,
  });
  const cleanPaths = resolveCleanPaths(environmentConfig, frameworkConfig);

  const runId = requestedRunId || createRunId("rebuild");
  const { runDir, runnerDir } = await ensureRunPaths(runId, "rebuild");
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
  const browser = await launchRuntimeBrowser();
  const measurementContract = buildRebuildMeasurementContract(frameworkConfig);

  try {
    for (const caseConfig of selectedCases) {
      const fixtureDir = resolveFixtureDir(caseConfig, frameworkConfig);
      const caseDir = join(runnerDir, `${sanitizeSegment(caseConfig.id)}__${sanitizeSegment(frameworkId)}`);
      const install = await runInstallStep(
        frameworkConfig,
        fixtureDir,
        caseDir,
        environmentConfig.installTimeoutMs,
      );
      const preparedMutations = await prepareCaseMutations(caseConfig.id, frameworkId, fixtureDir);
      const enabledIds = new Set(caseConfig.rebuildMutations || preparedMutations.map((entry) => entry.id));
      const activeMutations = preparedMutations.filter((entry) => enabledIds.has(entry.id));

      if (activeMutations.length === 0) {
        throw new Error(`No rebuild mutations enabled for ${caseConfig.id}`);
      }

      for (const mutation of activeMutations) {
        const result = await runMutationTrack({
          caseConfig,
        frameworkId,
        frameworkConfig,
        environmentConfig,
        measurementContract,
        fixtureDir,
          cleanPaths,
          caseDir,
          install,
          mutation,
          browser,
        });
        results.push(result);
      }
    }
  } finally {
    await browser.close();
  }

  const output = {
    schemaVersion: 1,
    runner: "rebuild",
    runId,
    generatedAt: new Date().toISOString(),
    environment,
    results,
  };

  const outputPath = join(runDir, "rebuild.json");
  await writeJson(outputPath, output);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
