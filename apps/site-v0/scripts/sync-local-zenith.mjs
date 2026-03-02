import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const siteRoot = resolve(__dirname, "..");

const steps = [
  {
    label: "cli dist",
    cwd: resolve(siteRoot, "../zenith-cli"),
    command: "npm",
    args: ["run", "build"],
  },
  {
    label: "runtime dist",
    cwd: resolve(siteRoot, "../zenith-runtime"),
    command: "npm",
    args: ["run", "build"],
  },
  {
    label: "bundler release",
    cwd: resolve(siteRoot, "../zenith-bundler"),
    command: "cargo",
    args: ["build", "--release"],
  },
];

for (const step of steps) {
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
