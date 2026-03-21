import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { runCommand } from "./process.mjs";

function readCommandVersion(command, args = ["--version"]) {
  const result = runCommand(command, args, { timeoutMs: 10000 });
  if (result.status !== 0) {
    return "";
  }
  return `${result.stdout}`.trim();
}

function hashFile(filePath) {
  if (!existsSync(filePath)) {
    return "";
  }
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function captureEnvironmentMetadata(input) {
  const cpuInfo = os.cpus()[0] || { model: "unknown" };
  const gitCommit = readCommandVersion("git", ["rev-parse", "HEAD"]);
  const npmVersion = readCommandVersion("npm");
  const bunVersion = readCommandVersion("bun");
  const fixtures = input.fixtureDirs.map((entry) => ({
    caseId: entry.caseId,
    frameworkId: entry.frameworkId,
    fixtureDir: entry.fixtureDir,
    lockfilePath: join(entry.fixtureDir, "package-lock.json"),
    lockfileSha256: hashFile(join(entry.fixtureDir, "package-lock.json")),
  }));

  return {
    host: input.host,
    warmupCount: input.warmupCount,
    sampleCount: input.sampleCount,
    machine: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpuInfo.model,
      cpuCount: os.cpus().length,
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    },
    runtime: {
      node: process.version,
      npm: npmVersion,
      bun: bunVersion,
    },
    gitCommit,
    fixtures,
  };
}
