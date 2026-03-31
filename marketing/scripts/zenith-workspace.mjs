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

function compilerBinaryName() {
  return process.platform === "win32" ? "zenith-compiler.exe" : "zenith-compiler";
}

function bundlerBinaryName() {
  return process.platform === "win32" ? "zenith-bundler.exe" : "zenith-bundler";
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
  const result = spawnSync(binaryPath, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) return "";
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const match = stdout.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : "";
}

function matchingWorkspaceCompilerBinary(expectedVersion) {
  if (!expectedVersion) return "";
  for (const candidate of compilerWorkspaceCandidateEntries()) {
    if (!existsSync(candidate.binaryPath)) continue;
    const packageVersion = readPackageVersion(candidate.versionPath);
    if (packageVersion === expectedVersion) return candidate.binaryPath;
    const actualVersion = readBinaryVersion(candidate.binaryPath);
    if (actualVersion === expectedVersion) return candidate.binaryPath;
  }
  return "";
}

function matchingWorkspaceBundlerBinary(expectedVersion) {
  if (!expectedVersion) return "";
  for (const candidate of bundlerWorkspaceCandidateEntries()) {
    if (!existsSync(candidate.binaryPath)) continue;
    const packageVersion = readPackageVersion(candidate.versionPath);
    if (packageVersion === expectedVersion) return candidate.binaryPath;
    const actualVersion = readBinaryVersion(candidate.binaryPath);
    if (actualVersion === expectedVersion) return candidate.binaryPath;
  }
  return "";
}

async function syncPublicAssets() {
  if (!existsSync(publicRoot)) return;
  await mkdir(distRoot, { recursive: true });
  const entries = await readdir(publicRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const source = resolve(publicRoot, entry.name);
    const target = resolve(distRoot, entry.name);
    await cp(source, target, { force: true, recursive: true });
  }
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
  const compilerBin = matchingWorkspaceCompilerBinary(expectedCliVersion);
  if (compilerBin) env.ZENITH_COMPILER_BIN = compilerBin;
}

if (!env.ZENITH_BUNDLER_BIN) {
  const bundlerBin = matchingWorkspaceBundlerBinary(expectedCliVersion);
  if (bundlerBin) env.ZENITH_BUNDLER_BIN = bundlerBin;
}

const zenithCliEntry = firstExisting(cliEntryCandidates());
if (!zenithCliEntry) {
  throw new Error("[zenith] Unable to resolve CLI entry for marketing workspace build.");
}

if (resolve(zenithCliEntry).startsWith(resolve(repoRoot, "packages", "cli"))) {
  env.ZENITH_PREFER_WORKSPACE_PACKAGES = "1";
}

async function main() {
  const command = process.argv[2];

  if (command === "dev") {
    const child = spawn(process.execPath, [zenithCliEntry, ...process.argv.slice(2)], {
      cwd: siteRoot,
      env,
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 1);
    });

    child.on("error", (error) => {
      throw error;
    });

    return;
  }

  const result = spawnSync(process.execPath, [zenithCliEntry, ...process.argv.slice(2)], {
    cwd: siteRoot,
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;

  if (command === "build" && result.status === 0) {
    await syncPublicAssets();
  }

  process.exit(result.status ?? 1);
}

await main();
