#!/usr/bin/env node

import { readFileSync } from "node:fs";

const ENV_PATH = new URL("../.env", import.meta.url);

function loadEnv(fileUrl) {
  return Object.fromEntries(
    readFileSync(fileUrl, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

async function run(scope) {
  const env = loadEnv(ENV_PATH);
  const baseUrl = (env.PUBLIC_URL || "http://localhost:8055").replace(/\/$/, "");
  const paths = scope === "documentation"
    ? ["/zenith-sync/documentation", "/@zenithbuild/zenith-sync/documentation"]
    : ["/zenith-sync/changelogs", "/@zenithbuild/zenith-sync/changelogs"];

  let lastFailure = null;

  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-repo-sync-token": env.REPO_SYNC_SHARED_TOKEN || "",
      },
    });
    const payload = await response.json();
    if (response.status === 404) {
      lastFailure = payload;
      continue;
    }
    console.log(JSON.stringify(payload, null, 2));
    if (!response.ok || payload.ok === false) {
      process.exit(1);
    }
    return;
  }

  console.log(JSON.stringify(lastFailure, null, 2));
  process.exit(1);
}

const scope = process.argv[2];
if (!["documentation", "changelogs"].includes(scope)) {
  console.error("Usage: node ./scripts/run-repo-sync.mjs <documentation|changelogs>");
  process.exit(1);
}

run(scope).catch((error) => {
  console.error(error);
  process.exit(1);
});
