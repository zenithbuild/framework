import { resolveAppRoute } from "../src/server/app-router";
import { test, expect } from "bun:test"; // Assuming bun test or equivalent, or vitest.

function mkApi(overrides: Partial<any> = {}) {
    return {
        fetchBlogList: async () => [{ slug: "hello", title: "Hello", excerpt: "World" }],
        fetchBlogPostBySlug: async (slug: string) => ({ slug, title: "Post " + slug, html: "<p>ok</p>" }),
        fetchDocsList: async () => [{ path: "a/b", title: "A/B" }],
        fetchDocByRoute: async (section: string, slug: string) => ({ section, slug, title: "Doc", path: `${section}/${slug}`, html: "<p>doc</p>" }),
        ...overrides
    };
}

test("home", async () => {
    const model = await resolveAppRoute("", mkApi());
    expect(model.view).toBe("home");
});

test("about", async () => {
    const model = await resolveAppRoute("about", mkApi());
    expect(model.view).toBe("about");
});

test("blog list", async () => {
    const model = await resolveAppRoute("blog", mkApi());
    expect(model.view).toBe("blog-list");
    expect(model.posts?.length).toBe(1);
});

test("blog post deep slug", async () => {
    const model = await resolveAppRoute("blog/a/b", mkApi());
    expect(model.view).toBe("blog-post");
    expect(model.post?.slug).toBe("a/b");
});

test("docs index", async () => {
    const model = await resolveAppRoute("docs", mkApi());
    expect(model.view).toBe("docs-index");
    expect(model.docsNav?.length).toBe(1);
});

test("docs page deep section", async () => {
    const model = await resolveAppRoute("docs/animations/gsap/patterns", mkApi());
    expect(model.view).toBe("docs-page");
    expect(model.doc?.path).toBe("animations/gsap/patterns");
});

test("docs invalid depth -> docs-index + error", async () => {
    const model = await resolveAppRoute("docs/onlyone", mkApi());
    expect(model.view).toBe("docs-index");
    expect(model.error?.code).toBe("BAD_ROUTE");
});

test("not found", async () => {
    const model = await resolveAppRoute("nope", mkApi());
    expect(model.view).toBe("not-found");
});
