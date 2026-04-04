import { rm } from "node:fs/promises";
import { join } from "node:path";

function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

async function fetchDevState(url, frameworkConfig) {
  const probe = frameworkConfig.readyProbe || {};
  const response = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!response || response.status !== probe.expectStatus) {
    return null;
  }

  if (probe.mode === "http-status") {
    return {
      response,
      state: {
        status: probe.expectStateStatus || "ok",
        httpStatus: response.status,
        readyUrl: url,
      },
    };
  }

  const state = await response.json().catch(() => null);
  if (!state || typeof state !== "object") {
    return null;
  }

  return { response, state };
}

export async function removeFixturePaths(rootDir, cleanPaths) {
  for (const relativePath of cleanPaths) {
    await rm(join(rootDir, relativePath), { recursive: true, force: true });
  }
}

export function resolveCleanPaths(environmentConfig, frameworkConfig) {
  const cleanPaths = new Set(environmentConfig.coldCleanPaths || []);
  for (const relativePath of frameworkConfig.cleanPaths || []) {
    cleanPaths.add(relativePath);
  }
  return [...cleanPaths];
}

export function resolveBuildArtifactPaths(frameworkConfig) {
  if (Array.isArray(frameworkConfig.buildArtifacts) && frameworkConfig.buildArtifacts.length > 0) {
    return frameworkConfig.buildArtifacts;
  }
  return ["dist"];
}

export function interpolateArgs(args, values = {}) {
  return args.map((arg) => {
    if (arg === "$PORT") {
      return String(values.port || "");
    }
    return arg;
  });
}

export function createLogCheckpoint(processHandle) {
  const logs = processHandle.logs();
  return {
    stdoutOffset: logs.stdout.length,
    stderrOffset: logs.stderr.length,
  };
}

export function readLogDelta(processHandle, checkpoint) {
  const logs = processHandle.logs();
  return {
    stdout: logs.stdout.slice(checkpoint.stdoutOffset),
    stderr: logs.stderr.slice(checkpoint.stderrOffset),
  };
}

import { isPortOpen, waitForHttp } from "./process.mjs";

export async function waitForReadyState(url, arg2, arg3) {
  const parsed = new URL(url);
  const port = parseInt(parsed.port, 10);
  const host = parsed.hostname === "localhost" ? "127.0.0.1" : (parsed.hostname || "127.0.0.1");
  const startedAt = Date.now();

  // Resolve polymorphism
  let timeoutMs = 60000;
  let frameworkConfig = { readyProbe: { mode: "http-status", expectStatus: 200 } };
  let environmentConfig = {};

  if (typeof arg2 === "number") {
    timeoutMs = arg2;
  } else if (typeof arg2 === "object" && arg2 !== null) {
    frameworkConfig = arg2;
    environmentConfig = arg3 || {};
    timeoutMs = environmentConfig.startupTimeoutMs || 60000;
  }

  // 1. Port open probe (The Stabilizer)
  let opened = false;
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port, host)) {
      opened = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!opened) {
    throw new Error(`Timed out waiting for port ${port} to open at ${host}`);
  }

  // 2. State polling (The Legacy Logic / Verification)
  const probe = frameworkConfig.readyProbe || {};
  while (Date.now() - startedAt < timeoutMs) {
    const settled = await fetchDevState(url, frameworkConfig);
    if (settled) {
      if (probe.mode === "http-status") {
        return settled;
      }
      if (settled.state.status === probe.expectStateStatus) {
        return settled;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, environmentConfig.pollIntervalMs || 250));
  }

  throw new Error(`Timed out waiting for ready state at ${url}`);
}

export async function waitForNextBuildState(url, frameworkConfig, environmentConfig, previousBuildId) {
  const startedAt = Date.now();
  const timeoutMs = environmentConfig.rebuildTimeoutMs || environmentConfig.startupTimeoutMs;

  while (Date.now() - startedAt < timeoutMs) {
    const settled = await fetchDevState(url, frameworkConfig);
    if (
      settled
      && Number.isInteger(settled.state.buildId)
      && settled.state.buildId > previousBuildId
      && settled.state.status === frameworkConfig.readyProbe.expectStateStatus
    ) {
      return settled;
    }

    await sleep(environmentConfig.pollIntervalMs);
  }

  throw new Error(`Timed out waiting for rebuild state at ${url} after buildId ${previousBuildId}`);
}

export async function probeRoute(url, caseId, frameworkConfig) {
  const verification = frameworkConfig.rebuildVerification || {};
  if (verification.mode === "route-check") {
    const targetUrl = new URL(url);
    const probeUrl = new URL(verification.path || "/__zenith/route-check", targetUrl.origin);
    probeUrl.searchParams.set("path", `${targetUrl.pathname}${targetUrl.search}`);
    const response = await fetch(probeUrl, {
      cache: "no-store",
      headers: {
        "x-zenith-route-check": "1",
      },
    });
    if (response.status !== 200) {
      throw new Error(`Route probe failed for ${caseId}: ${response.status}`);
    }
    const payload = await response.json().catch(() => null);
    return {
      url: probeUrl.toString(),
      status: response.status,
      mode: "route-check",
      routeId: typeof payload?.routeId === "string" ? payload.routeId : "",
      resultKind: typeof payload?.result?.kind === "string" ? payload.result.kind : "data",
    };
  }

  const response = await fetch(url, { cache: "no-store" });
  if (response.status !== 200) {
    throw new Error(`Route probe failed for ${caseId}: ${response.status}`);
  }

  return {
    url,
    status: response.status,
    mode: "route-fetch",
  };
}
