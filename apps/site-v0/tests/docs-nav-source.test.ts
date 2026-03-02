import { describe, expect, test } from "bun:test";
import { fetchDocsList } from "../src/server/content-store.ts";

describe("docs navigation source", () => {
    test("includes only canonical docs from zenith-docs nav artifacts", async () => {
        const docsNav = await fetchDocsList();

        expect(docsNav.length).toBeGreaterThan(0);
        expect(typeof docsNav[0]?.category).toBe("string");
        expect(typeof docsNav[0]?.categoryTitle).toBe("string");

        const paths = docsNav.map((entry) => entry.path);
        expect(paths).toContain("contracts/routing");
        expect(paths).toContain("guides/cms-unified-site");
        expect(paths).toContain("contributing/drift-gates");
        expect(paths).toContain("reference/server-data-api");

        for (const value of paths) {
            expect(value.startsWith("_legacy/")).toBe(false);
            expect(value.includes("/_legacy/")).toBe(false);
        }

        expect(paths).not.toContain("router/introduction");
        expect(paths).not.toContain("api/compiler");
        expect(paths).not.toContain("syntax/expressions");

        const guidesIndex = paths.indexOf("guides/cms-unified-site");
        const contributingIndex = paths.indexOf("contributing/drift-gates");
        expect(guidesIndex).toBeGreaterThanOrEqual(0);
        expect(contributingIndex).toBeGreaterThanOrEqual(0);
        expect(guidesIndex).toBeLessThan(contributingIndex);

        const categoryTitles = Array.from(new Set(docsNav.map((entry) => entry.categoryTitle)));
        const firstCategory = categoryTitles[0];
        expect(firstCategory).toBe("Contracts");
        expect(categoryTitles).toContain("Guides");
        expect(categoryTitles).toContain("Reference");
    });
});
