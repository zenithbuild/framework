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
  createRuntimeContext,
  launchRuntimeBrowser,
} from "./lib/browser-runtime.mjs";
import { interpolateArgs, removeFixturePaths, resolveCleanPaths, waitForReadyState } from "./lib/dev-state.mjs";
import { captureEnvironmentMetadata } from "./lib/environment.mjs";
import { getFreePort, startCommand, runCommand } from "./lib/process.mjs";
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

async function runReactiveSample({
  page,
  triggerSelector,
  verifySelector,
  verifyValue,
  environmentConfig,
}) {
  // Inject MutationObserver
  await page.evaluate(() => {
    globalThis.__benchMutationCount = 0;
    const observer = new MutationObserver((mutations) => {
      globalThis.__benchMutationCount += mutations.length;
    });
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true
    });
  });

  const startedAt = performance.now();
  
  // Trigger action
  await page.click(triggerSelector);
  
  // Wait for visible update
  await page.waitForFunction((args) => {
    const el = document.querySelector(args.selector);
    return el && el.textContent.includes(args.value);
  }, { selector: verifySelector, value: verifyValue }, { timeout: 5000 });
  
  const durationMs = Number((performance.now() - startedAt).toFixed(2));
  
  // Settle
  await page.waitForTimeout(100);
  
  const mutationCount = await page.evaluate(() => globalThis.__benchMutationCount);
  
  return {
    status: "passed",
    durationMs,
    mutationCount
  };
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseIdFilter = readFlag("--case") || "reactive-minimal";
  const requestedRunId = readFlag("--run-id");
  const profile = readFlag("--profile") || "fast";
  const resultsQuality = profile === "publication" ? "publishable" : "fast_non_publishable";

  const environmentConfig = await loadEnvironmentConfig();
  const frameworksConfig = await loadFrameworksConfig();
  const matrixConfig = await loadMatrixConfig();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  
  const selectedCases = selectCases(matrixConfig, "reactive-update", {
    frameworkId,
    caseId: caseIdFilter,
    supportedTracks: frameworkConfig.supportedTracks,
  });
  
  const cleanPaths = resolveCleanPaths(environmentConfig, frameworkConfig);

  const runId = requestedRunId || createRunId("reactive-update");
  const { runDir, runnerDir } = await ensureRunPaths(runId, "reactive-update");
  
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

  const browser = await launchRuntimeBrowser();
  const results = [];

  try {
    for (const caseConfig of selectedCases) {
      const fixtureDir = resolveFixtureDir(caseConfig, frameworkConfig);
      
      await removeFixturePaths(fixtureDir, cleanPaths);

      // Build first to ensure production preview works
      const buildCommandArray = frameworkConfig.commands.build || ["npm", "run", "build"];
      const [bCmd, ...bArgs] = buildCommandArray;
      console.log(`\n  Building ${caseConfig.id} (${frameworkId}) for reactive benchmark...`);
      const buildResult = runCommand(bCmd, bArgs, { 
        cwd: fixtureDir, 
        env: { ...process.env, ...frameworkConfig.env, ZENITH_SKIP_VERSION_CHECK: "1" } 
      });
      if (buildResult.status !== 0) {
        const reason = buildResult.error || buildResult.stderr || `exit=${buildResult.status}`;
        throw new Error(`Build failed for ${caseConfig.id}: ${reason}`);
      }

      const port = await getFreePort();
      const previewCommandMapping = frameworkConfig.commands.preview || frameworkConfig.commands.start || ["npm", "run", "preview"];
      const [command, ...args] = interpolateArgs(previewCommandMapping, { port });
      const processHandle = startCommand(command, args, {
        cwd: fixtureDir,
        env: { ...process.env, ...frameworkConfig.env, ZENITH_SKIP_VERSION_CHECK: "1" },
      });
      const origin = `http://127.0.0.1:${port}`;
      // In production preview mode, just check if the server is up (200 OK on root)
      const readyUrl = origin; 
      const routeUrl = `${origin}${caseConfig.startupPath}`;

      try {
        const startupTimeoutMs = 60000;
        await waitForReadyState(readyUrl, startupTimeoutMs);

        console.log(`\n[Reactive Update] ${caseConfig.id} (${frameworkId}) [Profile: ${profile}]`);

        // Warmup navigation + Content Assertion
        const warmupContext = await createRuntimeContext(browser, environmentConfig);
        const warmupPage = await warmupContext.newPage();
        try {
          console.log(`  Warmup navigation to ${routeUrl}...`);
          await warmupPage.goto(routeUrl, { waitUntil: "load" });
          // Assert essential benchmark elements exist before measurement
          await warmupPage.waitForSelector("[data-testid='increment-button']", { timeout: 5000 });
          await warmupPage.waitForSelector("[data-testid='count']", { timeout: 5000 });
          console.log(`  Warmup successful. Benchmark elements found.`);
        } finally {
          await warmupContext.close();
        }

        // Test Scenarios
        const scenarios = [
          { 
            id: "increment", 
            trigger: "[data-testid='increment-button']", 
            verify: "[data-testid='count']", 
            value: "1",
            expectedMutationCount: 1
          },
          { 
            id: "update-row", 
            trigger: "[data-testid='update-row-button']", 
            verify: "[data-testid='row-name']", 
            value: "Updated",
            expectedMutationCount: 1
          }
        ];

        for (const scenario of scenarios) {
          console.log(`  Scenario: ${scenario.id}...`);
          const samples = [];
          
          // Re-load for each run to ensure clean state
          const sampleCount = profile === "publication" ? 5 : 2;

          for (let index = 0; index < sampleCount; index++) {
            const context = await createRuntimeContext(browser, environmentConfig);
            const page = await context.newPage();
            await page.goto(routeUrl, { waitUntil: "load" });
            
            // Production build (preview) should be stable, but give it a moment to hydrate
            await page.waitForTimeout(1000);

            const result = await runReactiveSample({
              page,
              triggerSelector: scenario.trigger,
              verifySelector: scenario.verify,
              verifyValue: scenario.value,
              environmentConfig
            });
            
            samples.push(result);
            await context.close();
          }

          results.push({
            frameworkId,
            framework_kind: frameworkConfig.kind || frameworkId.split("-")[0],
            caseId: caseConfig.id,
            scenarioId: scenario.id,
            track: "reactive-update",
            benchmark_profile: profile,
            results_quality: resultsQuality,
            expected_mutation_count: scenario.expectedMutationCount,
            samples,
            summary: summarizeSamples(samples),
          });
        }

      } finally {
        await processHandle.stop(environmentConfig.shutdownTimeoutMs);
      }
    }
  } finally {
    await browser.close();
  }

  if (results.length === 0) {
    throw new Error(`Reactive update produced zero result rows for framework ${frameworkId}`);
  }

  const output = {
    schemaVersion: 1,
    runner: "reactive-update",
    runId,
    benchmark_profile: profile,
    results_quality: resultsQuality,
    generatedAt: new Date().toISOString(),
    environment,
    results,
  };

  const outputPath = join(runDir, "reactive-update.json");
  await writeJson(outputPath, output);
  console.log(`\nResults written to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
