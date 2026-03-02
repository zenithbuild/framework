#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.resolve(projectRoot, "..", "zenith-docs", "demos");
const targetRoot = path.resolve(projectRoot, "src", "components", "docs-demos");
const registryOut = path.resolve(projectRoot, "src", "server", "docs-demo-registry.generated.json");

function toTargetFileName(sourceFileName) {
    return `Docs${sourceFileName}`;
}

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function copyDemos() {
    await ensureDir(targetRoot);

    const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
    const demoFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".zen"))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    const targetDemoFiles = new Set(demoFiles.map((fileName) => toTargetFileName(fileName)));

    const targetEntries = await fs.readdir(targetRoot, { withFileTypes: true });
    for (const entry of targetEntries) {
        if (!entry.isFile() || !entry.name.endsWith(".zen")) {
            continue;
        }
        if (!targetDemoFiles.has(entry.name)) {
            await fs.rm(path.join(targetRoot, entry.name), { force: true });
        }
    }

    for (const fileName of demoFiles) {
        await fs.copyFile(
            path.join(sourceRoot, fileName),
            path.join(targetRoot, toTargetFileName(fileName)),
        );
    }

    const registrySource = path.join(sourceRoot, "registry.json");
    const registryRaw = await fs.readFile(registrySource, "utf8");
    const parsed = JSON.parse(registryRaw);
    await fs.writeFile(registryOut, JSON.stringify(parsed, null, 2) + "\n", "utf8");

    console.log(`Synced docs demos: ${demoFiles.length} components`);
}

copyDemos().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
