import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { test } from "bun:test"; // Assuming bun test

const root = resolve(__dirname, "..");

test("no DIRECTUS_TOKEN in dist", () => {
    if (!existsSync(resolve(root, "dist"))) return; // allow running before build
    try {
        execSync(`rg -n "DIRECTUS_TOKEN" dist`, { cwd: root, stdio: "pipe" });
        throw new Error("DIRECTUS_TOKEN found in dist");
    } catch (err: unknown) {
        if (err instanceof Error && err.message === "DIRECTUS_TOKEN found in dist") {
            throw err;
        }
        // ok: not found
    }
});
