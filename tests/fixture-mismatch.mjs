import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

console.log("Running T3: Version mismatch fixture...");

// This tests our logic inside `bin/zenith.js` which performs drift verification.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zenith-mismatch-fixture-"));

try {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({
        name: "fixture-mismatch",
        private: true
    }));

    // Create a locally fake mocked set of node_modules to force a mismatch error
    fs.mkdirSync(path.join(tmp, "node_modules", "@zenithbuild", "core", "bin"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "node_modules", "@zenithbuild", "cli"), { recursive: true });

    // Copy bin wrapper and its package.json
    const currentBin = fs.readFileSync(path.resolve(process.cwd(), "bin/zenith.js"), "utf8");
    fs.writeFileSync(path.join(tmp, "node_modules", "@zenithbuild", "core", "bin", "zenith.js"), currentBin);

    // Manipulate core to expect 99.9.9
    fs.writeFileSync(path.join(tmp, "node_modules", "@zenithbuild", "core", "package.json"), JSON.stringify({
        name: "@zenithbuild/core",
        version: "0.5.0-beta.1",
        dependencies: {
            "@zenithbuild/cli": "99.9.9",
            "@zenithbuild/compiler": "99.9.9",
            "@zenithbuild/runtime": "99.9.9",
            "@zenithbuild/router": "99.9.9",
            "@zenithbuild/bundler": "99.9.9"
        }
    }));

    // But fake-install CLI as 0.0.1
    fs.writeFileSync(path.join(tmp, "node_modules", "@zenithbuild", "cli", "package.json"), JSON.stringify({
        name: "@zenithbuild/cli",
        version: "0.0.1"
    }));
    fs.writeFileSync(path.join(tmp, "node_modules", "@zenithbuild", "cli", "index.js"), "console.log('hi');");

    let thrown = false;
    try {
        execSync(`node ./node_modules/@zenithbuild/core/bin/zenith.js`, { cwd: tmp, stdio: "pipe" });
    } catch (err) {
        if (err.stdout.toString().includes("Version mismatch") || err.stderr.toString().includes("Version mismatch")) {
            thrown = true;
        }
    }

    if (thrown) {
        console.log("✅ T3 passed: Version mismatch logic correctly failed fast and threw deterministic error.");
    } else {
        console.error("❌ T3 failed: Core executed without throwing version mismatch error.");
        process.exit(1);
    }
} catch (e) {
    console.error("❌ T3 setup failed: ", e);
    process.exit(1);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
