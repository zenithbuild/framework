#!/usr/bin/env node

import fs from "node:fs/promises";
import { listPublishMatrixLines } from "./publish-surface-lib.mjs";

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

  const maxAttempts = 30;
  const delayMs = 10000;

  console.log(`Verifying npm registry (selection=${selection}, version=${targetVersion}, distTag=${targetTag})`);

  const lines = listPublishMatrixLines({ selection, filter: "" });
  if (lines.length === 0) {
    console.error("Error: No packages resolved from publish matrix.");
    process.exit(1);
  }

  const packages = lines.map((line) => line.split("|")[1]);
  const results = Object.fromEntries(packages.map((name) => [
    name, { verified: false, expected: targetVersion, lastFound: "" }
  ]));
  let pending = packages;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await Promise.all(pending.map(async (name) => {
      const result = results[name];
      const url = new URL(encodeURIComponent(name) + "/" + encodeURIComponent(targetTag), "https://registry.npmjs.org/");
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error("HTTP " + response.status);
        }
        const manifest = await response.json();
        result.lastFound = manifest.version ?? "missing version";
        result.verified = manifest.name === name && result.lastFound === targetVersion;
      } catch (error) {
        result.lastFound = error.message;
      }
      console.log(`[Attempt ${attempt}/${maxAttempts}] ${name}: ${result.lastFound}`);
    }));
    pending = pending.filter((name) => !results[name].verified);
    if (pending.length === 0) {
      break;
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }
  const allVerified = pending.length === 0;

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
