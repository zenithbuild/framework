#!/usr/bin/env node

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { listPublishMatrixLines } from "./publish-surface-lib.mjs";

const execAsync = promisify(exec);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error("Usage: verify-npm-registry.mjs <selection> <version> <dist-tag> <output-file>");
    process.exit(1);
  }

  const selection = args[0];
  const targetVersion = args[1];
  const targetTag = args[2];
  const outputFile = args[3];

  const maxAttempts = 30; // 5 minutes total (30 * 10s)
  const delayMs = 10000;

  console.log(`Verifying npm registry (selection=${selection}, version=${targetVersion}, distTag=${targetTag})`);

  const lines = listPublishMatrixLines({ selection, filter: "" });
  if (lines.length === 0) {
    console.error("Error: No packages resolved from publish matrix.");
    process.exit(1);
  }

  const packages = lines.map((line) => line.split("|")[1]);
  const results = {};
  let allVerified = true;

  for (const pkg of packages) {
    console.log(`\nVerifying ${pkg}...`);
    let verified = false;
    let lastFound = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { stdout } = await execAsync(
          `npm view ${pkg}@${targetTag} version --json --loglevel=error --registry https://registry.npmjs.org/`
        );
        const version = JSON.parse(stdout.trim());
        if (version === targetVersion) {
            console.log(`✓ ${pkg} verified successfully (${version})`);
            verified = true;
            break;
        } else {
            lastFound = version;
        }
      } catch (e) {
        lastFound = "error / not found";
      }

      console.log(`  [Attempt ${attempt}/${maxAttempts}] Found: ${lastFound}`);
      await sleep(delayMs);
    }

    results[pkg] = { verified, expected: targetVersion, lastFound };
    if (!verified) {
      console.error(`✗ ${pkg} failed to propagate to version ${targetVersion} in time.`);
      allVerified = false;
    }
  }

  const payload = {
    verified: allVerified,
    selection,
    version: targetVersion,
    distTag: targetTag,
    packages,
    results,
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(outputFile, JSON.stringify(payload, null, 2));

  if (!allVerified) {
    console.error("\nVerification failed for one or more packages.");
    process.exit(1);
  }

  console.log("\nAll packages successfully verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
