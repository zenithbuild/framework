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
  captureRuntimeMetrics,
  createRuntimeContext,
  hydrationMeasurementContract,
  launchRuntimeBrowser,
} from "./lib/browser-runtime.mjs";
import { interpolateArgs, removeFixturePaths, resolveCleanPaths, waitForReadyState } from "./lib/dev-state.mjs";
import { captureEnvironmentMetadata } from "./lib/environment.mjs";
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

async function runBrowserSample({
  caseConfig,
  frameworkId,
  browser,
  environmentConfig,
  routeUrl,
  cellDir,
  sessionReadyStatePath,
  sampleLabel,
  isWarmup,
}) {
  const context = await createRuntimeContext(browser, environmentConfig);
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack || "",
    });
  });

  const stdoutPath = join(cellDir, `${sampleLabel}.console.json`);
  const pageErrorsPath = join(cellDir, `${sampleLabel}.page-errors.json`);
  const metricsPath = join(cellDir, `${sampleLabel}.metrics.json`);
  const screenshotPath = join(cellDir, `${sampleLabel}.screenshot.png`);
  const tracePath = join(cellDir, `${sampleLabel}.trace.zip`);

  if (!isWarmup) {
    await context.tracing.start({ screenshots: true, snapshots: true });
  }

  try {
    const startedAt = performance.now();
    const response = await page.goto(routeUrl, { waitUntil: "load", timeout: environmentConfig.browserCaptureTimeoutMs });
    await page.waitForTimeout(environmentConfig.browserSettleWindowMs);
    const wallDurationMs = Number((performance.now() - startedAt).toFixed(2));
    const metrics = await captureRuntimeMetrics(page);
    const routeStatus = response ? response.status() : null;
    const consoleErrors = consoleMessages.filter((message) => message.type === "error");

    await writeJson(stdoutPath, consoleMessages);
    await writeJson(pageErrorsPath, pageErrors);
    await writeJson(metricsPath, metrics);

    if (!isWarmup) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await context.tracing.stop({ path: tracePath });
    } else {
      await context.tracing.stop().catch(() => {});
    }

    const runtimeFailures = [];
    if (routeStatus === null || routeStatus >= 400) {
      runtimeFailures.push(`route status ${routeStatus === null ? "null" : routeStatus}`);
    }
    if (pageErrors.length > 0) {
      runtimeFailures.push(`${pageErrors.length} page error(s)`);
    }
    if (consoleErrors.length > 0) {
      runtimeFailures.push(`${consoleErrors.length} console error message(s)`);
    }
    if (runtimeFailures.length > 0) {
      throw new Error(
        `Hydration runtime failure for ${frameworkId}/${caseConfig.id}/${sampleLabel}: ${runtimeFailures.join(", ")}`
      );
    }

    const comparable = metrics.comparable;
    const durationMs = comparable.browserReadyCaptureMs;
    const markerCount = comparable.zenithMarkers?.count || 0;
    const msPerMarker = markerCount > 0 ? Number((durationMs / markerCount).toFixed(4)) : 0;

    return {
      label: sampleLabel,
      status: "passed",
      durationMs,
      wallDurationMs,
      marker_count: markerCount,
      ms_per_marker: msPerMarker,
      consolePath: stdoutPath,
      pageErrorsPath,
      metricsPath,
      screenshotPath: isWarmup ? null : screenshotPath,
      tracePath: isWarmup ? null : tracePath,
      sessionReadyStatePath,
      routeProbe: {
        url: routeUrl,
        status: response ? response.status() : null,
      },
      comparableMetrics: comparable,
      frameworkSpecific: {
        ...metrics.frameworkSpecific,
        frameworkId,
        consoleMessageCount: consoleMessages.length,
        pageErrorCount: pageErrors.length,
      },
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseId = readFlag("--case");
  const requestedRunId = readFlag("--run-id");
  const profile = readFlag("--profile") || "fast";
  const resultsQuality = profile === "publication" ? "publishable" : "fast_non_publishable";

  const environmentConfig = await loadEnvironmentConfig();
  const frameworksConfig = await loadFrameworksConfig();
  const matrixConfig = await loadMatrixConfig();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const selectedCases = selectCases(matrixConfig, "hydration-runtime", {
    frameworkId,
    caseId,
    supportedTracks: frameworkConfig.supportedTracks,
  });
  const cleanPaths = resolveCleanPaths(environmentConfig, frameworkConfig);

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

  const runId = requestedRunId || createRunId("hydration-runtime");
  const { runDir, runnerDir } = await ensureRunPaths(runId, "hydration-runtime");
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

  const measurementContract = hydrationMeasurementContract(environmentConfig);
  const browser = await launchRuntimeBrowser();
  const results = [];

  try {
    for (const caseConfig of selectedCases) {
      const fixtureDir = resolveFixtureDir(caseConfig, frameworkConfig);
      const cellDir = join(runnerDir, `${sanitizeSegment(caseConfig.id)}__${sanitizeSegment(frameworkId)}`);
      const install = await runInstallStep(
        frameworkConfig,
        fixtureDir,
        cellDir,
        environmentConfig.installTimeoutMs,
      );

      await removeFixturePaths(fixtureDir, cleanPaths);

      const port = await getFreePort();
      const [command, ...args] = interpolateArgs(frameworkConfig.commands.dev, { port });
      const processHandle = startCommand(command, args, {
        cwd: fixtureDir,
        env: { ...process.env, ...frameworkConfig.env },
      });
      const origin = `http://${environmentConfig.host}:${port}`;
      const readyUrl = `${origin}${frameworkConfig.readyProbe.path}`;
      const routeUrl = `${origin}${caseConfig.startupPath}`;
      const sessionReadyStatePath = join(cellDir, "session.ready-state.json");

      try {
        const ready = await waitForReadyState(readyUrl, frameworkConfig, environmentConfig);
        await writeJson(sessionReadyStatePath, ready.state);

        console.log(`\n[Hydration] ${caseConfig.id} (${frameworkId}) [Profile: ${profile}]`);

        const samples = [];
        for (let index = 0; index < warmupCount + sampleCount; index += 1) {
          const isWarmup = index < warmupCount;
          const sampleLabel = isWarmup ? `warmup-${index + 1}` : `sample-${index + 1 - warmupCount}`;
          console.log(`  ${sampleLabel}...`);
          
          const sample = await runBrowserSample({
            caseConfig,
            frameworkId,
            browser,
            environmentConfig,
            routeUrl,
            cellDir,
            sessionReadyStatePath,
            sampleLabel,
            isWarmup,
          });

          if (!isWarmup) {
            samples.push(sample);
          }
        }

        results.push({
          frameworkId,
          framework_kind: frameworkConfig.kind || frameworkId.split("-")[0],
          caseId: caseConfig.id,
          track: "hydration-runtime",
          benchmark_profile: profile,
          results_quality: resultsQuality,
          fixtureDir,
          install,
          warmupCount,
          sampleCount,
          measurementContract,
          correlation_scope: frameworkId === "zenith" ? "zenith_internal" : "external-unlabeled",
          session: {
            origin,
            routeUrl,
            readyUrl,
            sessionReadyStatePath,
          },
          samples,
          summary: summarizeSamples(samples),
        });
      } finally {
        await processHandle.stop(environmentConfig.shutdownTimeoutMs);
      }
    }
  } finally {
    await browser.close();
  }

  const output = {
    schemaVersion: 1,
    runner: "hydration-runtime",
    runId,
    benchmark_profile: profile,
    results_quality: resultsQuality,
    generatedAt: new Date().toISOString(),
    environment,
    measurementContract,
    results,
  };

  const outputPath = join(runDir, "hydration-runtime.json");
  await writeJson(outputPath, output);
  console.log(`\nResults written to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
