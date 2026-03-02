import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { test, expect, describe } from "bun:test";

const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");

function findHtmlFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findHtmlFiles(full));
        else if (entry.name.endsWith(".html")) results.push(full);
    }
    return results;
}

function findBuiltCssAsset(dir: string): string {
    const assetsDir = resolve(dir, "assets");
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.startsWith("styles.") && entry.name.endsWith(".css")) {
            return join(assetsDir, entry.name);
        }
    }
    throw new Error(`No built CSS asset found in ${assetsDir}`);
}

function anchorContainsHrefAndAttr(html: string, href: string, attr: string): boolean {
    const pattern = new RegExp(`<a\\b[^>]*\\bhref=["']${href}["'][^>]*\\b${attr}\\b|<a\\b[^>]*\\b${attr}\\b[^>]*\\bhref=["']${href}["']`, "g");
    return pattern.test(html);
}

describe("C1 — ZenLink expansion contract", () => {
    const htmlFiles = findHtmlFiles(distDir);

    test("dist contains at least one HTML file", () => {
        expect(htmlFiles.length).toBeGreaterThan(0);
    });

    test("zero raw <ZenLink tags in dist HTML", () => {
        for (const file of htmlFiles) {
            const html = readFileSync(file, "utf-8");
            const matches = html.match(/<ZenLink[\s>]/g);
            expect(matches ?? []).toHaveLength(0);
        }
    });

    test("at least one data-zen-link anchor in dist HTML", () => {
        let total = 0;
        for (const file of htmlFiles) {
            const html = readFileSync(file, "utf-8");
            const matches = html.match(/data-zen-link/g);
            total += matches?.length ?? 0;
        }
        expect(total).toBeGreaterThan(0);
    });

    test("data-zen-link appears on <a> elements only", () => {
        for (const file of htmlFiles) {
            const html = readFileSync(file, "utf-8");
            const pattern = /<(\w+)\s[^>]*data-zen-link/g;
            let match;
            while ((match = pattern.exec(html)) !== null) {
                expect(match[1]).toBe("a");
            }
        }
    });

    test("internal nav links include data-zen-link in dist HTML", () => {
        const expectedInternalHrefs = ["/", "/about", "/blog", "/roadmap", "/showcase", "/docs"];
        const joinedHtml = htmlFiles.map((file) => readFileSync(file, "utf-8")).join("\n");

        for (const href of expectedInternalHrefs) {
            expect(anchorContainsHrefAndAttr(joinedHtml, href, "data-zen-link")).toBe(true);
        }
    });

    test("external/hash/blank-target anchors are not tagged as data-zen-link", () => {
        for (const file of htmlFiles) {
            const html = readFileSync(file, "utf-8");
            expect(/<a\b[^>]*data-zen-link[^>]*href=["']https?:\/\//g.test(html)).toBe(false);
            expect(/<a\b[^>]*data-zen-link[^>]*href=["']#/g.test(html)).toBe(false);
            expect(/<a\b[^>]*data-zen-link[^>]*target=["']_blank["']/g.test(html)).toBe(false);
        }
    });
});

describe("C2 — SSR branch FOUC gate", () => {
    const cssPath = findBuiltCssAsset(distDir);

    test("compiled CSS contains data-zx-class FOUC gate rule", () => {
        const css = readFileSync(cssPath, "utf-8");
        expect(css).toContain("data-zx-class");
        expect(css).toContain(":not([class])");
    });

    test("main elements with data-zx-class have no pre-set class attribute in SSR HTML", () => {
        const htmlFiles = findHtmlFiles(distDir);
        for (const file of htmlFiles) {
            const html = readFileSync(file, "utf-8");
            const mainPattern = /<main\s[^>]*data-zx-class="[^"]*"[^>]*>/g;
            let match;
            while ((match = mainPattern.exec(html)) !== null) {
                const tag = match[0];
                const hasClassAttr = /\sclass="/.test(tag) || /\sclass='/.test(tag);
                expect(hasClassAttr).toBe(false);
            }
        }
    });
});
