import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { test, expect } from "bun:test"; // Assuming bun test

const root = resolve(__dirname, "..");

function rg(pattern: string, dir: string) {
    try {
        execSync(`rg -n "${pattern}" "${dir}"`, { cwd: root, stdio: "pipe" });
        return true; // found
    } catch {
        return false; // not found
    }
}

test("no svelte-style blocks", () => {
    expect(rg("\\{#each|\\{#if|\\{:else", "src")).toBe(false);
});

test("no zenhtml usage", () => {
    expect(rg("zenhtml`", "src")).toBe(false);
});

test("no Object.freeze in app", () => {
    expect(rg("Object\\.freeze\\(", "src")).toBe(false);
});

test("no mouseover or mouseout bindings in app source", () => {
    expect(rg("on:mouseover|on:mouseout", "src")).toBe(false);
});

/* ── Unified theme drift gates ── */

test("no per-page palette overrides — raw oklch only in globals.css", () => {
    // Page files and component files must NOT define raw oklch color values.
    // All colors must come from tokens defined in globals.css.
    const pagesHaveOklch = rg("oklch\\(", "src/pages");
    const layoutHasOklch = rg("oklch\\(", "src/components/layout");
    expect(pagesHaveOklch).toBe(false);
    expect(layoutHasOklch).toBe(false);
});

test("layout components are structural-only — no hooks or state", () => {
    // Layout components must not contain zenMount, zenEffect, signal(), or ref()
    expect(rg("zenMount", "src/components/layout")).toBe(false);
    expect(rg("zenEffect", "src/components/layout")).toBe(false);
    expect(rg("signal\\(", "src/components/layout")).toBe(false);
    expect(rg("ref\\(", "src/components/layout")).toBe(false);
});

test("all pages use RootLayout", () => {
    // Every .zen file in src/pages must use the shared RootLayout
    const { execSync: execSyncImport } = require("node:child_process");
    const { readdirSync, statSync, readFileSync } = require("node:fs");
    const { join } = require("node:path");

    const pagesDir = join(root, "src", "pages");

    function collectZenFiles(dir: string): string[] {
        const results: string[] = [];
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) {
                results.push(...collectZenFiles(full));
            } else if (entry.endsWith(".zen")) {
                results.push(full);
            }
        }
        return results;
    }

    const zenFiles = collectZenFiles(pagesDir);
    const missing = zenFiles.filter((f) => {
        const content = readFileSync(f, "utf-8");
        return !content.includes("<RootLayout");
    });

    expect(missing).toEqual([]);
});
