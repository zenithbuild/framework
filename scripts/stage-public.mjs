#!/usr/bin/env node

import { access, cp, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const root = process.cwd();
  const sourceDir = resolve(root, "public");
  const distDir = resolve(root, "dist");

  if (!(await exists(sourceDir))) {
    console.log("[stage-public] no public/ directory found; nothing to copy");
    return;
  }

  await mkdir(distDir, { recursive: true });
  await cp(sourceDir, distDir, { recursive: true, force: true });
  console.log("[stage-public] copied public/ into dist/");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
