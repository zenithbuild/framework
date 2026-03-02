import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(coreDir, "..");

console.log("Running T1: Core-only install fixture...");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zenith-fixture-"));
try {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({
        name: "fixture-test",
        private: true,
        dependencies: {
            "@zenithbuild/core": "file:" + coreDir,
            "@zenithbuild/cli": "file:" + path.join(repoRoot, "zenith-cli"),
            "@zenithbuild/compiler": "file:" + path.join(repoRoot, "zenith-compiler"),
            "@zenithbuild/runtime": "file:" + path.join(repoRoot, "zenith-runtime"),
            "@zenithbuild/router": "file:" + path.join(repoRoot, "zenith-router"),
            "@zenithbuild/bundler": "file:" + path.join(repoRoot, "zenith-bundler")
        }
    }));

    execSync("npm install", { cwd: tmp, stdio: "ignore" });

    fs.mkdirSync(path.join(tmp, "src", "pages"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "src", "pages", "index.zen"), "<h1>Core Install Fixture</h1>");
    fs.writeFileSync(path.join(tmp, "zenith.config.js"), "export default {};");

    execSync("npx zenith build", { cwd: tmp, stdio: "inherit" });
    console.log("✅ T1 passed: zenith build succeeded via core-only local install.");
} catch (e) {
    console.error("❌ T1 failed:", e);
    process.exit(1);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
