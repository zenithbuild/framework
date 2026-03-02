#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const GATES = [
  "scripts/gates/docs-structure.mjs",
  "scripts/gates/docs-syntax.mjs",
  "scripts/gates/docs-snippets.mjs",
];

for (const gate of GATES) {
  const gatePath = path.join(ROOT, gate);
  const result = spawnSync(process.execPath, [gatePath], {
    stdio: "inherit",
    cwd: ROOT,
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}

if (!process.exitCode) {
  console.log("check-docs-integrity completed (structure + syntax + snippets)");
}
