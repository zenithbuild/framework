import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(__dirname, "..");

console.log("Running T2: Deep import ban fixture...");

try {
    // We use node's import.meta.resolve to test if a deep path is allowed
    // For the exact constraint, the inner packages shouldn't have deep exports.

    // Create a synthetic script attempting to deep import from compiler
    const scriptContent = `
    import * as compiler from "@zenithbuild/compiler/src/index.js";
  `;
    const tmpScript = path.join(coreDir, "tests", "temp-deep-import.mjs");
    fs.writeFileSync(tmpScript, scriptContent);

    let failed = false;
    try {
        execSync(`node ${tmpScript}`, { stdio: 'pipe' });
    } catch (err) {
        if (err.message.includes("ERR_PACKAGE_PATH_NOT_EXPORTED")) {
            failed = true;
        }
    }

    fs.unlinkSync(tmpScript);

    if (failed) {
        console.log("✅ T2 passed: Deep import was successfully blocked by exports map.");
    } else {
        console.error("❌ T2 failed: Deep import was allowed! Ensure standard packages block /src/* in exports.");
        process.exit(1);
    }
} catch (e) {
    console.error("❌ T2 failed with unexpected error:", e);
    process.exit(1);
}
