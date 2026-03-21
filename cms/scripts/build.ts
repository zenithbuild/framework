#!/usr/bin/env node

import { execSync } from "child_process";

import * as os from "os";

import path from "path";

// Since all your scripts are in the same folder as this file,

// __dirname points to the "scripts" folder.

const scriptDir = __dirname;

const bashScript = path.join(scriptDir, "build.sh");

const psScript = path.join(scriptDir, "build.ps1");

function runScript(command: string) {
  execSync(command, { stdio: "inherit" });
}

function isBashAvailable(): boolean {
  try {
    execSync('bash -c "echo using bash"', { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
}

function main() {
  const platform = os.platform();

  try {
    if (platform === "win32") {
      if (isBashAvailable()) {
        console.log("🐧 Detected Bash on Windows (Git Bash or WSL)");

        runScript(`bash "${bashScript}"`);
      } else {
        console.log("🪟 Running PowerShell script...");

        runScript(`powershell -ExecutionPolicy Bypass -File "${psScript}"`);
      }
    } else {
      console.log("🐧 Running Bash script...");

      runScript(`bash "${bashScript}"`);
    }
  } catch (error: any) {
    console.error("❌ Error running build script:", error.message);

    process.exit(1);
  }
}

main();
