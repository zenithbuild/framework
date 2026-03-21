import { createRuntimeContext } from "./browser-runtime.mjs";

function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function cacheBustedUrl(routeUrl, sampleLabel, attempt) {
  const url = new URL(routeUrl);
  url.searchParams.set("__bench_rebuild", `${sampleLabel}-${attempt}-${Date.now()}`);
  return url.toString();
}

async function evaluateChecks(page, checks) {
  return await page.evaluate((probeChecks) => {
    function normalizeText(value) {
      return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    }

    const evaluated = probeChecks.map((check) => {
      const node = document.querySelector(check.selector);
      const result = {
        kind: check.kind,
        selector: check.selector,
        pass: false,
        actual: null,
        expected: null,
        detail: "",
      };

      if (!node) {
        result.detail = "selector-not-found";
        return result;
      }

      if (check.kind === "text") {
        const text = normalizeText(node.textContent);
        result.actual = text;
        if ("equals" in check) {
          result.expected = check.equals;
          result.pass = text === check.equals;
        } else if ("includes" in check) {
          result.expected = check.includes;
          result.pass = text.includes(check.includes);
        } else if ("notIncludes" in check) {
          result.expected = `not ${check.notIncludes}`;
          result.pass = !text.includes(check.notIncludes);
        }
        return result;
      }

      if (check.kind === "attribute") {
        const value = node.getAttribute(check.name);
        result.actual = value;
        result.expected = check.equals;
        result.pass = value === check.equals;
        return result;
      }

      if (check.kind === "style") {
        const value = getComputedStyle(node)[check.property];
        result.actual = value;
        result.expected = check.equals;
        result.pass = value === check.equals;
        return result;
      }

      result.detail = "unsupported-check";
      return result;
    });

    return {
      matched: evaluated.every((check) => check.pass),
      checks: evaluated,
    };
  }, checks);
}

export async function createRebuildProbeSession(browser, environmentConfig) {
  const context = await createRuntimeContext(browser, environmentConfig);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(environmentConfig.browserCaptureTimeoutMs);

  return {
    context,
    page,
    async close() {
      await context.close();
    },
  };
}

export async function waitForBrowserProbe({
  page,
  routeUrl,
  probe,
  environmentConfig,
  sampleLabel,
}) {
  const startedAt = Date.now();
  const attempts = [];

  while (Date.now() - startedAt < environmentConfig.rebuildTimeoutMs) {
    const attempt = attempts.length + 1;
    const probeUrl = cacheBustedUrl(routeUrl, sampleLabel, attempt);
    let responseStatus = null;
    let navigationError = "";

    try {
      const response = await page.goto(probeUrl, { waitUntil: "load" });
      responseStatus = response ? response.status() : null;
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(environmentConfig.browserSettleWindowMs);
    let evaluation;
    try {
      evaluation = await evaluateChecks(page, probe);
    } catch (error) {
      evaluation = {
        matched: false,
        checks: [
          {
            kind: "probe-error",
            selector: "",
            pass: false,
            actual: null,
            expected: null,
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
    attempts.push({
      attempt,
      url: probeUrl,
      responseStatus,
      navigationError,
      matched: evaluation.matched,
      checks: evaluation.checks,
    });

    if (evaluation.matched) {
      return {
        routeProbe: {
          url: probeUrl,
          status: responseStatus,
        },
        attempts,
        finalChecks: evaluation.checks,
      };
    }

    await sleep(environmentConfig.pollIntervalMs);
  }

  const lastAttempt = attempts[attempts.length - 1];
  throw new Error(
    `Timed out waiting for browser rebuild probe at ${routeUrl}\nLast attempt: ${
      lastAttempt ? JSON.stringify(lastAttempt) : "none"
    }`,
  );
}
