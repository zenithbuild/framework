import { describe, expect, test } from "bun:test";
import { fetchDocByPath, fetchDocsList } from "../src/server/content-store.ts";

describe("legacy docs visibility", () => {
    test("legacy router docs are hidden from navigation", async () => {
        const docsNav = await fetchDocsList();
        const paths = docsNav.map((entry) => entry.path);

        expect(paths).not.toContain("router/introduction");
        expect(paths).not.toContain("router/advanced");
        expect(paths).not.toContain("router/examples");
    });

    test("legacy docs do not resolve by path", async () => {
        const intro = await fetchDocByPath("router/introduction");
        const advanced = await fetchDocByPath("router/advanced");

        expect(intro).toBeNull();
        expect(advanced).toBeNull();
    });
});
