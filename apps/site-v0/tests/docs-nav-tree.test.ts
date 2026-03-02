import { describe, expect, test } from "bun:test";
import { fetchDocByPath, fetchDocsNavTree } from "../src/server/content-store.ts";

function isBeforeOrEqualByOrderAndLabel(
    previous: { order: number; title: string; idOrPath: string },
    current: { order: number; title: string; idOrPath: string },
): boolean {
    const prevFinite = Number.isFinite(previous.order);
    const currFinite = Number.isFinite(current.order);
    if (prevFinite && currFinite) {
        if (previous.order !== current.order) {
            return previous.order <= current.order;
        }
    } else if (prevFinite && !currFinite) {
        return true;
    } else if (!prevFinite && currFinite) {
        return false;
    }

    const titleDelta = current.title.localeCompare(previous.title);
    if (titleDelta !== 0) {
        return titleDelta >= 0;
    }
    const idDelta = current.idOrPath.localeCompare(previous.idOrPath);
    return idDelta >= 0;
}

describe("docs nav tree", () => {
    test("uses deterministic ordering and canonical /docs hrefs", async () => {
        const tree = await fetchDocsNavTree();

        expect(tree.length).toBeGreaterThan(0);

        for (let groupIndex = 0; groupIndex < tree.length; groupIndex += 1) {
            const group = tree[groupIndex];
            expect(group.id.length).toBeGreaterThan(0);
            expect(group.title.length).toBeGreaterThan(0);

            if (groupIndex > 0) {
                const prev = tree[groupIndex - 1];
                expect(
                    isBeforeOrEqualByOrderAndLabel(
                        { order: prev.order, title: prev.title, idOrPath: prev.id },
                        { order: group.order, title: group.title, idOrPath: group.id }
                    )
                ).toBe(true);
            }

            for (let itemIndex = 0; itemIndex < group.items.length; itemIndex += 1) {
                const item = group.items[itemIndex];
                expect(item.path.length).toBeGreaterThan(0);
                expect(item.href).toBe(`/docs/${item.path}`);
                expect(item.slug).toBe(item.href);
                expect(item.href.startsWith("/docs/")).toBe(true);

                if (itemIndex > 0) {
                    const prevItem = group.items[itemIndex - 1];
                    expect(
                        isBeforeOrEqualByOrderAndLabel(
                            { order: prevItem.order, title: prevItem.title, idOrPath: prevItem.path },
                            { order: item.order, title: item.title, idOrPath: item.path }
                        )
                    ).toBe(true);
                }
            }
        }
    });

    test("all nav tree links resolve to docs pages", async () => {
        const tree = await fetchDocsNavTree();

        for (const group of tree) {
            for (const item of group.items) {
                const doc = await fetchDocByPath(item.path);
                expect(doc).not.toBeNull();
            }
        }
    });
});
