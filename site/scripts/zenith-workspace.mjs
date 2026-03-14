#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { cp, mkdir, readdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const siteRoot = resolve(__dirname, "..");
const repoRoot = resolve(siteRoot, "..");
const publicRoot = resolve(siteRoot, "src", "public");
const distRoot = resolve(siteRoot, "dist");
const cliPackagePath = resolve(repoRoot, "packages", "cli", "package.json");
const bundlerWorkspaceRoot = resolve(repoRoot, "packages", "bundler");
const bundlerWorkspaceSrcRoot = resolve(bundlerWorkspaceRoot, "src");
const bundlerWorkspaceManifest = resolve(bundlerWorkspaceRoot, "Cargo.toml");
let publicAssetSyncChain = Promise.resolve();

function compilerBinaryName() {
  return process.platform === "win32" ? "zenith-compiler.exe" : "zenith-compiler";
}

function bundlerBinaryName() {
  return process.platform === "win32" ? "zenith-bundler.exe" : "zenith-bundler";
}

function compilerWorkspaceCandidates() {
  const binaryName = compilerBinaryName();
  const platformSegment = `${process.platform}-${process.arch}`;

  return [
    resolve(repoRoot, "packages", "compiler", "target", "release", binaryName),
    resolve(repoRoot, "packages", `compiler-${platformSegment}`, "bin", binaryName),
  ];
}

function compilerWorkspaceCandidateEntries() {
  const binaryName = compilerBinaryName();
  const platformSegment = `${process.platform}-${process.arch}`;

  return [
    {
      binaryPath: resolve(repoRoot, "packages", "compiler", "target", "release", binaryName),
      versionPath: resolve(repoRoot, "packages", "compiler", "package.json"),
    },
    {
      binaryPath: resolve(repoRoot, "packages", `compiler-${platformSegment}`, "bin", binaryName),
      versionPath: resolve(repoRoot, "packages", `compiler-${platformSegment}`, "package.json"),
    },
  ];
}

function bundlerWorkspaceCandidates() {
  const binaryName = bundlerBinaryName();
  const platformSegment = `${process.platform}-${process.arch}`;

  return [
    resolve(repoRoot, "packages", "bundler", "target", "release", binaryName),
    resolve(repoRoot, "packages", "bundler", "target", "debug", binaryName),
    resolve(repoRoot, "packages", `bundler-${platformSegment}`, "bin", binaryName),
  ];
}

function bundlerWorkspaceCandidateEntries() {
  const binaryName = bundlerBinaryName();
  const platformSegment = `${process.platform}-${process.arch}`;

  return [
    {
      binaryPath: resolve(repoRoot, "packages", "bundler", "target", "release", binaryName),
      versionPath: resolve(repoRoot, "packages", "bundler", "package.json"),
    },
    {
      binaryPath: resolve(repoRoot, "packages", "bundler", "target", "debug", binaryName),
      versionPath: resolve(repoRoot, "packages", "bundler", "package.json"),
    },
    {
      binaryPath: resolve(repoRoot, "packages", `bundler-${platformSegment}`, "bin", binaryName),
      versionPath: resolve(repoRoot, "packages", `bundler-${platformSegment}`, "package.json"),
    },
  ];
}

function firstExisting(paths) {
  for (const candidate of paths) {
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function readExpectedCliVersion() {
  try {
    const raw = readFileSync(cliPackagePath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version.trim() : "";
  } catch {
    return "";
  }
}

function readPackageVersion(packagePath) {
  if (!packagePath || !existsSync(packagePath)) return "";
  try {
    const raw = readFileSync(packagePath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version.trim() : "";
  } catch {
    return "";
  }
}

function readBinaryVersion(binaryPath) {
  if (!binaryPath || !existsSync(binaryPath)) return "";
  const result = spawnSync(binaryPath, ["--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return "";
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const match = stdout.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : "";
}

function matchingWorkspaceBinary(paths, expectedVersion) {
  if (!expectedVersion) return "";
  for (const candidate of paths) {
    if (!existsSync(candidate)) continue;
    const actualVersion = readBinaryVersion(candidate);
    if (actualVersion === expectedVersion) {
      return candidate;
    }
  }
  return "";
}

function matchingWorkspaceCompilerBinary(expectedVersion) {
  if (!expectedVersion) return "";
  for (const candidate of compilerWorkspaceCandidateEntries()) {
    if (!existsSync(candidate.binaryPath)) continue;
    const packageVersion = readPackageVersion(candidate.versionPath);
    if (packageVersion === expectedVersion) {
      return candidate.binaryPath;
    }
    const actualVersion = readBinaryVersion(candidate.binaryPath);
    if (actualVersion === expectedVersion) {
      return candidate.binaryPath;
    }
  }
  return "";
}

function matchingWorkspaceBundlerBinary(expectedVersion) {
  if (!expectedVersion) return "";
  for (const candidate of bundlerWorkspaceCandidateEntries()) {
    if (!existsSync(candidate.binaryPath)) continue;
    const packageVersion = readPackageVersion(candidate.versionPath);
    if (packageVersion === expectedVersion) {
      return candidate.binaryPath;
    }
    const actualVersion = readBinaryVersion(candidate.binaryPath);
    if (actualVersion === expectedVersion) {
      return candidate.binaryPath;
    }
  }
  return "";
}

function newestMtimeMs(entryPath) {
  if (!entryPath || !existsSync(entryPath)) return 0;
  const stats = statSync(entryPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let newest = stats.mtimeMs;
  for (const child of readdirSync(entryPath)) {
    const childPath = resolve(entryPath, child);
    newest = Math.max(newest, newestMtimeMs(childPath));
  }
  return newest;
}

function isWorkspaceBundlerBinary(binaryPath) {
  if (!binaryPath) return false;
  const normalizedBinaryPath = resolve(binaryPath);
  return normalizedBinaryPath.startsWith(resolve(bundlerWorkspaceRoot, "target"));
}

function ensureFreshWorkspaceBundlerBinary(expectedVersion = "") {
  if (!isWorkspaceBundlerBinary(env.ZENITH_BUNDLER_BIN) || !existsSync(env.ZENITH_BUNDLER_BIN)) {
    return;
  }

  const binaryMtimeMs = newestMtimeMs(env.ZENITH_BUNDLER_BIN);
  const sourceMtimeMs = Math.max(
    newestMtimeMs(bundlerWorkspaceSrcRoot),
    newestMtimeMs(bundlerWorkspaceManifest),
  );
  const actualVersion = readBinaryVersion(env.ZENITH_BUNDLER_BIN);
  const hasVersionMismatch =
    typeof expectedVersion === "string" &&
    expectedVersion.length > 0 &&
    typeof actualVersion === "string" &&
    actualVersion.length > 0 &&
    actualVersion !== expectedVersion;

  if (sourceMtimeMs <= binaryMtimeMs && !hasVersionMismatch) {
    return;
  }

  const rebuildResult = spawnSync(
    "cargo",
    ["build", "--manifest-path", bundlerWorkspaceManifest, "--release"],
    {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    },
  );

  if (rebuildResult.error) {
    throw rebuildResult.error;
  }

  if (rebuildResult.status !== 0) {
    throw new Error("[zenith] Failed to rebuild stale workspace bundler binary.");
  }
}

function ensureMatchingWorkspaceBundlerOverride(expectedVersion) {
  if (
    !expectedVersion ||
    !env.ZENITH_BUNDLER_BIN ||
    !isWorkspaceBundlerBinary(env.ZENITH_BUNDLER_BIN) ||
    !existsSync(env.ZENITH_BUNDLER_BIN)
  ) {
    return;
  }

  const actualVersion = readBinaryVersion(env.ZENITH_BUNDLER_BIN);
  if (actualVersion === expectedVersion) {
    return;
  }

  delete env.ZENITH_BUNDLER_BIN;
}

async function syncPublicAssets() {
  if (!existsSync(publicRoot)) return;

  await mkdir(distRoot, { recursive: true });
  const entries = await readdir(publicRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const source = resolve(publicRoot, entry.name);
    const target = resolve(distRoot, entry.name);
    await copyPublicEntryWithRetry(source, target);
  }
}

function isTransientPublicAssetError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  return code === "ENOENT" || code === "EEXIST" || code === "EBUSY";
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

async function copyPublicEntryWithRetry(source, target, attempt = 0) {
  try {
    await cp(source, target, { force: true, recursive: true });
  } catch (error) {
    if (!isTransientPublicAssetError(error) || attempt >= 3) {
      throw error;
    }
    await mkdir(distRoot, { recursive: true });
    await delay(50 * (attempt + 1));
    await copyPublicEntryWithRetry(source, target, attempt + 1);
  }
}

function schedulePublicAssetSync() {
  publicAssetSyncChain = publicAssetSyncChain
    .catch(() => {})
    .then(() => syncPublicAssets());
  return publicAssetSyncChain;
}

function normalizeDevHost(hostValue) {
  if (hostValue === "0.0.0.0" || hostValue === "::") {
    return "127.0.0.1";
  }
  return hostValue;
}

function readOptionValue(args, optionName) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === optionName) {
      return typeof args[index + 1] === "string" ? args[index + 1] : "";
    }
    if (typeof value === "string" && value.startsWith(`${optionName}=`)) {
      return value.slice(optionName.length + 1);
    }
  }
  return "";
}

function resolveDevServerOrigin(args) {
  const hostValue = normalizeDevHost(readOptionValue(args, "--host") || "127.0.0.1");
  const portValue = readOptionValue(args, "--port") || "3000";
  const portNumber = Number.parseInt(portValue, 10);
  if (!Number.isFinite(portNumber) || portNumber <= 0) {
    return "";
  }
  return `http://${hostValue}:${portNumber}`;
}

async function readDevState(origin) {
  if (!origin) return null;
  try {
    const response = await fetch(new URL("/__zenith_dev/state", origin), {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function startDevPublicAssetSync(origin) {
  if (!origin) {
    return () => {};
  }

  let stopped = false;
  let inFlight = false;
  let pollTimer = null;
  let lastSyncedBuildId = Number.NaN;

  async function poll() {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    try {
      const state = await readDevState(origin);
      const buildId = Number(state?.buildId);
      if (state?.status === "ok" && Number.isInteger(buildId) && buildId !== lastSyncedBuildId) {
        await schedulePublicAssetSync();
        lastSyncedBuildId = buildId;
      }
    } catch {
      // Retry on the next poll tick.
    } finally {
      inFlight = false;
      if (!stopped) {
        pollTimer = setTimeout(() => {
          void poll();
        }, 250);
      }
    }
  }

  void poll();

  return () => {
    stopped = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };
}

function cliEntryCandidates() {
  return [
    resolve(repoRoot, "packages", "cli", "dist", "index.js"),
    resolve(siteRoot, "node_modules", "@zenithbuild", "cli", "dist", "index.js"),
  ];
}

const env = { ...process.env };
const expectedCliVersion = readExpectedCliVersion();

if (!env.ZENITH_COMPILER_BIN) {
  // The compiler binary reports its internal Rust crate version (`zenith_cli 0.2.0`)
  // instead of the npm package version, so select workspace compilers by their
  // package version hint before falling back to the reported binary version.
  const compilerBin = matchingWorkspaceCompilerBinary(expectedCliVersion);
  if (compilerBin) {
    env.ZENITH_COMPILER_BIN = compilerBin;
  }
}

if (!env.ZENITH_BUNDLER_BIN) {
  const bundlerBin = matchingWorkspaceBundlerBinary(expectedCliVersion);
  if (bundlerBin) {
    env.ZENITH_BUNDLER_BIN = bundlerBin;
  }
}

ensureFreshWorkspaceBundlerBinary(expectedCliVersion);
ensureMatchingWorkspaceBundlerOverride(expectedCliVersion);

const zenithCliEntry = firstExisting(cliEntryCandidates());
if (!zenithCliEntry) {
  throw new Error("[zenith] Unable to resolve CLI entry for site workspace build.");
}

if (resolve(zenithCliEntry).startsWith(resolve(repoRoot, "packages", "cli"))) {
  env.ZENITH_PREFER_WORKSPACE_PACKAGES = "1";
}

async function main() {
  const command = process.argv[2];

  if (command === "dev") {
    const stopPublicAssetSync = startDevPublicAssetSync(resolveDevServerOrigin(process.argv.slice(3)));
    const child = spawn(process.execPath, [zenithCliEntry, ...process.argv.slice(2)], {
      cwd: siteRoot,
      env,
      stdio: "inherit",
    });

    const shutdown = () => {
      stopPublicAssetSync();
    };

    child.on("exit", (code, signal) => {
      shutdown();
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 1);
    });

    child.on("error", (error) => {
      shutdown();
      throw error;
    });

    return;
  }

  if (command === "preview") {
    await schedulePublicAssetSync();
  }

  const result = spawnSync(process.execPath, [zenithCliEntry, ...process.argv.slice(2)], {
    cwd: siteRoot,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (command === "build" && result.status === 0) {
    await schedulePublicAssetSync();
  }

  process.exit(result.status ?? 1);
}

await main();
