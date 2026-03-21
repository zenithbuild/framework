import { chromium } from "playwright";

export function hydrationMeasurementContract(environmentConfig) {
  return {
    phase: "phase-1 browser runtime capture",
    viewport: environmentConfig.browserViewport,
    postLoadSettleWindowMs: environmentConfig.browserSettleWindowMs,
    comparableMetrics: [
      "browserReadyCaptureMs",
      "navigation.responseEndMs",
      "navigation.domInteractiveMs",
      "navigation.domContentLoadedMs",
      "navigation.loadEventEndMs",
      "paints.firstPaintMs",
      "paints.firstContentfulPaintMs",
      "scripts.count",
      "scripts.totalTransferSize",
      "scripts.totalEncodedBodySize",
      "longTasks.count",
      "longTasks.totalDurationMs",
      "longTasks.maxDurationMs",
    ],
    frameworkSpecificSidecars: [
      "metricsPath",
      "consolePath",
      "pageErrorsPath",
      "tracePath",
      "screenshotPath",
      "sessionReadyStatePath",
    ],
  };
}

export async function launchRuntimeBrowser() {
  return chromium.launch({ headless: true });
}

export async function createRuntimeContext(browser, environmentConfig) {
  const context = await browser.newContext({
    viewport: environmentConfig.browserViewport,
    serviceWorkers: "block",
  });

  await context.addInitScript(() => {
    globalThis.__benchRuntime = {
      longTasks: [],
    };

    if (!("PerformanceObserver" in globalThis)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const bucket = globalThis.__benchRuntime?.longTasks;
        if (!Array.isArray(bucket)) {
          return;
        }
        for (const entry of list.getEntries()) {
          bucket.push({
            name: entry.name,
            startTime: Number(entry.startTime.toFixed(2)),
            duration: Number(entry.duration.toFixed(2)),
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Long tasks are a sidecar metric and may not be available in every environment.
    }
  });

  return context;
}

export async function captureRuntimeMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paintEntries = performance.getEntriesByType("paint");
    const resourceEntries = performance.getEntriesByType("resource");
    const scriptEntries = resourceEntries.filter((entry) => entry.initiatorType === "script");
    const longTasks = Array.isArray(globalThis.__benchRuntime?.longTasks)
      ? globalThis.__benchRuntime.longTasks
      : [];

    const firstPaint = paintEntries.find((entry) => entry.name === "first-paint");
    const firstContentfulPaint = paintEntries.find((entry) => entry.name === "first-contentful-paint");
    const totalTransferSize = scriptEntries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
    const totalEncodedBodySize = scriptEntries.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0);
    const totalDecodedBodySize = scriptEntries.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0);
    const longTaskTotalDuration = longTasks.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const longTaskMaxDuration = longTasks.reduce(
      (max, entry) => Math.max(max, entry.duration || 0),
      0,
    );

    return {
      comparable: {
        browserReadyCaptureMs: Number(performance.now().toFixed(2)),
        navigation: navigation
          ? {
            responseEndMs: Number(navigation.responseEnd.toFixed(2)),
            domInteractiveMs: Number(navigation.domInteractive.toFixed(2)),
            domContentLoadedMs: Number(navigation.domContentLoadedEventEnd.toFixed(2)),
            loadEventEndMs: Number(navigation.loadEventEnd.toFixed(2)),
          }
          : null,
        paints: {
          firstPaintMs: firstPaint ? Number(firstPaint.startTime.toFixed(2)) : null,
          firstContentfulPaintMs: firstContentfulPaint
            ? Number(firstContentfulPaint.startTime.toFixed(2))
            : null,
        },
        scripts: {
          count: scriptEntries.length,
          totalTransferSize,
          totalEncodedBodySize,
          totalDecodedBodySize,
        },
        longTasks: {
          count: longTasks.length,
          totalDurationMs: Number(longTaskTotalDuration.toFixed(2)),
          maxDurationMs: Number(longTaskMaxDuration.toFixed(2)),
        },
      },
      frameworkSpecific: {
        documentReadyState: document.readyState,
        scriptResourceUrls: scriptEntries.map((entry) => entry.name),
        longTaskEntries: longTasks,
      },
    };
  });
}
