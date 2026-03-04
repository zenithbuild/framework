// meta/index.ts
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
var __filename2 = fileURLToPath(import.meta.url);
var __dirname2 = path.dirname(__filename2);
var require2 = createRequire(import.meta.url);
var PLATFORM_PACKAGES = {
  "darwin-arm64": {
    packageName: "@zenithbuild/compiler-darwin-arm64",
    binaryName: "zenith-compiler",
    os: "darwin",
    arch: "arm64"
  },
  "darwin-x64": {
    packageName: "@zenithbuild/compiler-darwin-x64",
    binaryName: "zenith-compiler",
    os: "darwin",
    arch: "x64"
  },
  "linux-x64": {
    packageName: "@zenithbuild/compiler-linux-x64",
    binaryName: "zenith-compiler",
    os: "linux",
    arch: "x64"
  },
  "win32-x64": {
    packageName: "@zenithbuild/compiler-win32-x64",
    binaryName: "zenith-compiler.exe",
    os: "win32",
    arch: "x64"
  }
};
function safeResolvePackageRoot(packageName) {
  try {
    return path.dirname(require2.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}
function currentPlatformPackage() {
  return PLATFORM_PACKAGES[`${process.platform}-${process.arch}`] || null;
}
function resolveLegacyCompilerBin() {
  const legacyBinary = path.resolve(__dirname2, "..", "target", "release", process.platform === "win32" ? "zenith-compiler.exe" : "zenith-compiler");
  return existsSync(legacyBinary) ? legacyBinary : null;
}
function resolveCompilerBin() {
  const platformPackage = currentPlatformPackage();
  if (platformPackage) {
    const packageRoot = safeResolvePackageRoot(platformPackage.packageName);
    if (packageRoot) {
      const binaryPath = path.resolve(packageRoot, "bin", platformPackage.binaryName);
      if (existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  }
  const legacyBinary = resolveLegacyCompilerBin();
  if (legacyBinary) {
    return legacyBinary;
  }
  const supportedPlatforms = Object.keys(PLATFORM_PACKAGES).join(", ");
  const expectedPackage = platformPackage?.packageName || "@zenithbuild/compiler-<platform>";
  throw new Error(`[zenith] Compiler binary not installed for ${process.platform}-${process.arch}. ` + `Reinstall @zenithbuild/compiler and ensure ${expectedPackage} is present. ` + `Supported platform packages: ${supportedPlatforms}.`);
}
function compile(entryPathOrSource, filePathOrOptions = {}) {
  const bin = resolveCompilerBin();
  let args;
  const spawnOptions = { encoding: "utf8" };
  if (typeof entryPathOrSource === "object" && entryPathOrSource !== null && "source" in entryPathOrSource && "filePath" in entryPathOrSource) {
    args = ["--stdin", entryPathOrSource.filePath];
    spawnOptions.input = entryPathOrSource.source;
  } else if (typeof entryPathOrSource === "string" && typeof filePathOrOptions === "string") {
    args = ["--stdin", filePathOrOptions];
    spawnOptions.input = entryPathOrSource;
  } else {
    args = [String(entryPathOrSource)];
  }
  const result = spawnSync(bin, args, spawnOptions);
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || "Compiler execution failed");
  }
  return JSON.parse(result.stdout);
}
export {
  resolveCompilerBin,
  compile
};
