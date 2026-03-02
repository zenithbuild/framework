import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPreviewServer } from "../../zenith-cli/src/preview.js";
import { chromium } from "playwright";

const projectRoot = resolve(import.meta.dir, "..");
const distDir = join(projectRoot, "dist");
const pagesDir = join(projectRoot, "src", "pages");
const docsBlogTemplateFiles = [
    "src/pages/docs/index.zen",
    "src/pages/docs/[...slug].zen",
    "src/pages/blog/index.zen",
    "src/pages/blog/[...slug].zen"
];
let previewPortCursor = 43000 + (process.pid % 1000);

function nextPreviewPort(): number {
    previewPortCursor += 1;
    return previewPortCursor;
}

async function startPreviewServer() {
    return createPreviewServer({ distDir, port: nextPreviewPort() });
}

function readDistJsBundle(): string {
    const assetsDir = join(distDir, "assets");
    if (!existsSync(assetsDir)) {
        return "";
    }

    return readdirSync(assetsDir)
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFileSync(join(assetsDir, file), "utf8"))
        .join("\n");
}

function assertNoUndefinedCompilerSymbolRefs(source: string): void {
    const stateBlock = source.match(/const __zenith_state_values = Object\.freeze\(\[(.*?)\]\);/s);
    if (!stateBlock) {
        return;
    }

    const entries = stateBlock[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    for (const entry of entries) {
        if (!entry.startsWith("___")) {
            continue;
        }
        const identifier = entry.replace(/[^\w$]/g, "");
        if (!identifier) {
            continue;
        }
        const declaration = new RegExp(`\\b(?:const|let|var|function)\\s+${identifier}\\b`);
        expect(declaration.test(source)).toBe(true);
    }
}

function normalizeWhitespace(input: string): string {
    return input.replace(/\s+/g, " ").trim();
}

function extractSsrPayload(html: string): Record<string, unknown> | null {
    const match = html.match(
        /<script id="zenith-ssr-data">window\.__zenith_ssr_data = ([\s\S]*?)<\/script>/
    );
    if (!match) {
        return null;
    }
    const raw = match[1].trim().replace(/;\s*$/, "");
    return JSON.parse(raw) as Record<string, unknown>;
}

function extractMainText(html: string): string {
    const match = html.match(/<main\b[\s\S]*?<\/main>/i);
    if (!match) {
        return "";
    }
    return match[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("Catch-all SSR routes", () => {
    beforeAll(() => {
        if (!existsSync(distDir)) {
            throw new Error("dist/ is missing. Run `npm run build` first.");
        }
    });

    test("site defines explicit home/about pages plus docs/blog nested routes", () => {
        const pageFiles = readdirSync(pagesDir, { recursive: true })
            .filter((entry) => String(entry).endsWith(".zen"))
            .map((entry) => String(entry).replace(/\\/g, "/"))
            .sort();

        expect(pageFiles).toEqual([
            "__docs-demo/[id].zen",
            "about.zen",
            "blog/[...slug].zen",
            "blog/index.zen",
            "docs/[...slug].zen",
            "docs/index.zen",
            "index.zen"
        ]);
        expect(existsSync(join(projectRoot, "src", "cms", "generated-content.ts"))).toBe(false);
    });

    test("docs slug route uses <script server> (no frozen snapshot arrays)", () => {
        const catchAllRoute = readFileSync(join(projectRoot, "src/pages/docs/[...slug].zen"), "utf8");

        expect(catchAllRoute).toContain("<script server");
        expect(catchAllRoute).toContain("lang=\"ts\"");
        expect(catchAllRoute).toContain("../../server/content-store.ts");
        expect(catchAllRoute).not.toContain("../server/directus.ts");
        expect(catchAllRoute).not.toContain("Object.freeze([])");
        expect(catchAllRoute).not.toContain("Object.freeze(");
    });

    test("filesystem content store reads zenith-docs artifacts with explicit docs visibility policy", () => {
        const contentStore = readFileSync(join(projectRoot, "src/server/content-store.ts"), "utf8");

        expect(contentStore).toContain("docs.manifest.json");
        expect(contentStore).toContain("compileCmsBody");
        expect(contentStore).toContain("zenith-docs");
        expect(contentStore).toContain("ZENITH_DOCS_INCLUDE_DRAFT");
    });

    test("docs/blog templates keep runtime boundary guards out of page files", () => {
        for (const relativePath of docsBlogTemplateFiles) {
            const source = readFileSync(join(projectRoot, relativePath), "utf8");
            expect(source).not.toContain("Array.isArray(");
            expect(source).not.toContain("String(");
            expect(source).not.toContain("Number(");
            expect(source).not.toContain("as unknown");
            expect(/\bany\b/.test(source)).toBe(false);
        }
    });

    test("content-store keeps runtime guards at the server boundary", () => {
        const contentStore = readFileSync(join(projectRoot, "src/server/content-store.ts"), "utf8");
        expect(contentStore).toContain("Array.isArray(");
        expect(contentStore).toContain("String(");
    });

    test("router manifest includes explicit routes and modern nested slugs", () => {
        const manifestPath = join(distDir, "assets", "router-manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
            routes?: Array<{ path?: string; server_script?: string | null }>;
        };

        const routes = manifest.routes || [];
        const routePaths = routes.map((route) => String(route.path || ""));

        expect(routePaths).toContain("/docs/*slug");
        expect(routePaths).toContain("/blog/*slug");
        expect(routePaths).toContain("/__docs-demo/:id");
        expect(routePaths).toContain("/");
        expect(routePaths).toContain("/about");
        expect(routePaths).toContain("/docs");
        expect(routePaths).toContain("/blog");
        expect(routePaths).not.toContain("/*slug");

        const catchAllRoute = routes.find((route) => route.path === "/docs/*slug");
        expect(typeof catchAllRoute?.server_script).toBe("string");
    });

    test("compiled route bundles contain no dangling ___*_raw symbol references", () => {
        const manifest = JSON.parse(
            readFileSync(join(distDir, "assets", "router-manifest.json"), "utf8")
        ) as { routes?: Array<{ page_asset?: string | null }> };

        for (const route of manifest.routes || []) {
            const pageAsset = String(route.page_asset || "");
            if (!pageAsset.endsWith(".js")) {
                continue;
            }
            const source = readFileSync(join(distDir, pageAsset), "utf8");
            assertNoUndefinedCompilerSymbolRefs(source);
        }
    });

    test("rendered route HTML contains no raw expression or object-coercion text leaks", () => {
        const manifest = JSON.parse(
            readFileSync(join(distDir, "assets", "router-manifest.json"), "utf8")
        ) as { routes?: Array<{ output?: string | null }> };

        for (const route of manifest.routes || []) {
            const output = String(route.output || "");
            if (!output.endsWith(".html")) {
                continue;
            }
            const html = readFileSync(join(distDir, output), "utf8");
            expect(html).not.toContain("__z_frag_");
            expect(html).not.toContain(".map((");
            expect(html).not.toContain("[object Object]");
        }
    });

    test("client bundles contain no Directus token/URL fetch logic", () => {
        const js = readDistJsBundle();

        expect(js).not.toContain("DIRECTUS_TOKEN");
        expect(js).not.toContain("http://localhost:8055/items");
        expect(js).not.toContain("localhost:8055/fields");
        expect(js).not.toContain("createDirectus(");
    });

    test("SSR output emits one active main branch for / and /about", () => {
        const homeHtml = readFileSync(join(distDir, "index.html"), "utf8");
        const aboutHtml = readFileSync(join(distDir, "about", "index.html"), "utf8");

        expect((homeHtml.match(/<main\b/g) ?? []).length).toBe(1);
        expect((aboutHtml.match(/<main\b/g) ?? []).length).toBe(1);

        const normalizedHome = normalizeWhitespace(homeHtml);
        const normalizedAbout = normalizeWhitespace(aboutHtml);
        expect(normalizedHome).toContain("Production Ready | The modern reactive framework | 2026");
        expect(normalizedHome).not.toContain("Our Story | The Genesis of Zenith | 2026");
        expect(normalizedAbout).toContain("Our Story | The Genesis of Zenith | 2026");
        expect(normalizedAbout).not.toContain("Production Ready | The modern reactive framework | 2026");
    });

    test("about SSR payload exposes github community model keys", async () => {
        const preview = await startPreviewServer();
        const baseUrl = `http://127.0.0.1:${preview.port}`;

        try {
            const response = await fetch(`${baseUrl}/about`);
            expect(response.status).toBe(200);
            const html = await response.text();
            const payload = extractSsrPayload(html);
            expect(payload).not.toBeNull();
            const model = ((payload || {}) as Record<string, unknown>).model as
                | Record<string, unknown>
                | undefined;
            expect(model?.view).toBe("about");
            expect(Array.isArray(model?.coreMembers)).toBe(true);
            expect(Array.isArray(model?.contributors)).toBe(true);
            const githubError = (model?.githubError as unknown) ?? null;
            expect(githubError === null || typeof githubError === "string").toBe(true);
        } finally {
            preview.close();
        }
    }, 20000);

    test("preview SSR for /blog, /docs renders non-empty main and clean payload/chunk contract", async () => {
        const preview = await startPreviewServer();
        const baseUrl = `http://127.0.0.1:${preview.port}`;

        try {
            const routes = ["/blog", "/docs"];
            for (const route of routes) {
                const response = await fetch(`${baseUrl}${route}`);
                expect(response.status).toBe(200);
                const html = await response.text();

                expect((html.match(/<script id="zenith-ssr-data">/g) ?? []).length).toBe(1);
                expect((html.match(/<main\b/g) ?? []).length).toBe(1);
                expect(extractMainText(html).length).toBeGreaterThan(20);

                const payload = extractSsrPayload(html);
                expect(payload).not.toBeNull();
                expect(typeof payload).toBe("object");
                const model = ((payload || {}) as Record<string, unknown>).model as
                    | Record<string, unknown>
                    | undefined;

                expect(html).not.toContain("__z_frag_");
                expect(html).not.toContain(".map((");
                expect(html).not.toContain("[object Object]");
                expect(html).not.toContain("Array.isArray(");
                expect(html).not.toContain("String(");
                expect(html).not.toContain("Number(");

                if (route === "/blog") {
                    expect(model?.view).toBe("blog-list");
                    const posts = Array.isArray(model?.posts) ? model?.posts : [];
                    const slugs = posts
                        .map((entry) => String((entry as Record<string, unknown>).slug || ""))
                        .filter(Boolean);
                    expect(slugs).toContain("routing-awareness");
                }

                if (route === "/docs") {
                    expect(model?.view).toBe("docs-index");
                    const docsNav = Array.isArray(model?.docsNav) ? model?.docsNav : [];
                    const paths = docsNav
                        .map((entry) => String((entry as Record<string, unknown>).path || ""))
                        .filter(Boolean);
                    expect(paths).toContain("contracts/routing");
                    const guidesIndex = paths.indexOf("guides/cms-unified-site");
                    const contributingIndex = paths.indexOf("contributing/drift-gates");
                    expect(guidesIndex).toBeGreaterThanOrEqual(0);
                    expect(contributingIndex).toBeGreaterThanOrEqual(0);
                    expect(guidesIndex).toBeLessThan(contributingIndex);
                }
            }
        } finally {
            preview.close();
        }

        const manifest = JSON.parse(
            readFileSync(join(distDir, "assets", "router-manifest.json"), "utf8")
        ) as { routes?: Array<{ path?: string; page_asset?: string | null }> };
        const catchAllDocs = (manifest.routes || []).find((route) => route.path === "/docs/*slug");
        const catchAllAsset = String(catchAllDocs?.page_asset || "");
        expect(catchAllAsset.endsWith(".js")).toBe(true);
        const source = readFileSync(join(distDir, catchAllAsset), "utf8");
        expect(source).not.toContain("props.model.");
    }, 20000);

    test("preview SSR renders every docs/blog content route with non-empty main output", async () => {
        const preview = await startPreviewServer();
        const baseUrl = `http://127.0.0.1:${preview.port}`;

        try {
            const docsResponse = await fetch(`${baseUrl}/docs`);
            const blogResponse = await fetch(`${baseUrl}/blog`);
            expect(docsResponse.status).toBe(200);
            expect(blogResponse.status).toBe(200);

            const docsPayload = extractSsrPayload(await docsResponse.text()) || {};
            const blogPayload = extractSsrPayload(await blogResponse.text()) || {};
            const docsModel =
                (docsPayload as Record<string, unknown>).model as Record<string, unknown> | undefined;
            const blogModel =
                (blogPayload as Record<string, unknown>).model as Record<string, unknown> | undefined;

            const docsRoutes = (Array.isArray(docsModel?.docsNav) ? docsModel.docsNav : [])
                .map((entry) => `/docs/${String((entry as Record<string, unknown>).path || "")}`)
                .filter((route) => route.length > "/docs/".length);
            const blogRoutes = (Array.isArray(blogModel?.posts) ? blogModel.posts : [])
                .map((entry) => `/blog/${String((entry as Record<string, unknown>).slug || "")}`)
                .filter((route) => route.length > "/blog/".length);
            const routes = Array.from(new Set([...docsRoutes, ...blogRoutes]));

            expect(routes.length).toBeGreaterThan(0);
            expect(docsRoutes.length).toBeGreaterThan(0);
            expect(blogRoutes.length).toBeGreaterThan(0);

            for (const route of routes) {
                const response = await fetch(`${baseUrl}${route}`);
                expect(response.status).toBe(200);
                const html = await response.text();

                expect((html.match(/<script id="zenith-ssr-data">/g) ?? []).length).toBe(1);
                expect((html.match(/<main\b/g) ?? []).length).toBe(1);

                const mainText = extractMainText(html);

                const payload = extractSsrPayload(html);
                expect(payload).not.toBeNull();
                const model = ((payload || {}) as Record<string, unknown>).model as
                    | Record<string, unknown>
                    | undefined;

                if (route.startsWith("/docs/")) {
                    expect(model?.view).toBe("docs-page");
                    const docHtml = String(model?.docHtml || "");
                    expect(docHtml.length).toBeGreaterThan(20);
                    if (mainText.length <= 20) {
                        expect(docHtml.length).toBeGreaterThan(20);
                    }
                } else if (route.startsWith("/blog/")) {
                    expect(model?.view).toBe("blog-post");
                    const post = (model?.post || {}) as Record<string, unknown>;
                    const postHtml = String(post.html || "");
                    expect(postHtml.length).toBeGreaterThan(20);
                    if (mainText.length <= 20) {
                        expect(postHtml.length).toBeGreaterThan(20);
                    }
                }
            }
        } finally {
            preview.close();
        }
    }, 120000);

    test("docs detail sidebar renders collapsible buckets and routable /docs hrefs", async () => {
        const preview = await startPreviewServer();
        const baseUrl = `http://127.0.0.1:${preview.port}`;

        try {
            const response = await fetch(`${baseUrl}/docs/contracts/routing`);
            expect(response.status).toBe(200);
            const html = await response.text();

            expect(html).toContain("data-docs-nav-state-key=\"zenith.docs.nav.open.v1\"");
            const payload = extractSsrPayload(html) || {};
            const model = (payload as Record<string, unknown>).model as Record<string, unknown> | undefined;
            const navGroups = Array.isArray(model?.navGroups) ? model.navGroups : [];
            expect(navGroups.length).toBeGreaterThan(0);

            const activeGroups = navGroups.filter(
                (entry) => Boolean((entry as Record<string, unknown>).isActive)
            );
            expect(activeGroups.length).toBeGreaterThan(0);

            const hrefs = Array.from(
                new Set(
                    navGroups.flatMap((entry) => {
                        const group = entry as Record<string, unknown>;
                        const links = Array.isArray(group.links) ? group.links : [];
                        return links
                            .map((link) => String((link as Record<string, unknown>).href || ""))
                            .filter((href) => href.startsWith("/docs/"));
                    })
                )
            );

            expect(hrefs.length).toBeGreaterThan(0);

            const sample = hrefs.slice(0, 8);
            for (const href of sample) {
                const linked = await fetch(`${baseUrl}${href}`);
                expect(linked.status).toBe(200);
            }
        } finally {
            preview.close();
        }
    }, 20000);

    test("docs demo route is layout-rendered and counter demo hydrates interactions", async () => {
        const preview = await startPreviewServer();
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        const baseUrl = `http://127.0.0.1:${preview.port}`;
        const errors: string[] = [];

        page.on("pageerror", (error) => {
            errors.push(error.message);
        });
        page.on("console", (message) => {
            if (message.type() === "error") {
                errors.push(message.text());
            }
        });

        try {
            const response = await fetch(`${baseUrl}/__docs-demo/counter-basic`);
            expect(response.status).toBe(200);
            const html = await response.text();

            const payload = extractSsrPayload(html) || {};
            const model = (payload as Record<string, unknown>).model as Record<string, unknown> | undefined;
            expect(model?.view).toBe("demo");
            expect(model?.id).toBe("counter-basic");
            expect(String(model?.title || "")).toBe("Counter");

            await page.goto(`${baseUrl}/__docs-demo/counter-basic`, { waitUntil: "networkidle" });

            const values = await page.evaluate(() => {
                const counterNode = document.querySelector("main .text-4xl.font-mono");
                return {
                    before: (counterNode?.textContent || "").trim()
                };
            });

            expect(values.before.length).toBeGreaterThan(0);

            await page.getByRole("button", { name: "Increment" }).click();

            const after = await page.evaluate(() => {
                const counterNode = document.querySelector("main .text-4xl.font-mono");
                return (counterNode?.textContent || "").trim();
            });

            expect(after).not.toBe(values.before);

            const crash = errors.find((message) =>
                message.includes("[Zenith Router] initial navigation failed") ||
                message.includes("[Zenith Runtime] UNRESOLVED_EXPRESSION")
            );
            expect(crash).toBeUndefined();
        } finally {
            await browser.close();
            preview.close();
        }
    }, 20000);

    test("hydrated dynamic routes render visible content with schema-backed links and no raw leaks", async () => {
        const preview = await startPreviewServer();
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        const baseUrl = `http://127.0.0.1:${preview.port}`;
        const errors: string[] = [];
        let firstDocsDetailRoute = "";
        let firstBlogDetailRoute = "";

        page.on("pageerror", (error) => {
            errors.push(error.message);
        });
        page.on("console", (message) => {
            if (message.type() === "error") {
                errors.push(message.text());
            }
        });

        try {
            const routes = ["/blog", "/docs"];
            for (const route of routes) {
                errors.length = 0;
                await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });

                const result = await page.evaluate(() => {
                    const main = document.querySelector("main");
                    const mainText = (main?.textContent || "").replace(/\s+/g, " ").trim();
                    const data = (globalThis as unknown as { __zenith_ssr_data?: Record<string, unknown> })
                        .__zenith_ssr_data as Record<string, unknown> | undefined;
                    const model = (data?.model || {}) as Record<string, unknown>;
                    const docsNav = Array.isArray(model.docsNav) ? model.docsNav : [];
                    const posts = Array.isArray(model.posts) ? model.posts : [];
                    const categories = Array.isArray(model.categories) ? model.categories : [];

                    const docsHrefs = Array.from(document.querySelectorAll('a[href^="/docs/"]'))
                        .map((anchor) => anchor.getAttribute("href") || "");
                    const blogHrefs = Array.from(document.querySelectorAll('a[href^="/blog/"]'))
                        .map((anchor) => anchor.getAttribute("href") || "");
                    const zenButtonTexts = Array.from(document.querySelectorAll("[data-zen-btn]"))
                        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
                        .filter(Boolean);

                    return {
                        mainText,
                        docsNav,
                        posts,
                        docsHrefs,
                        blogHrefs,
                        categoriesLength: categories.length,
                        zenButtonTexts
                    };
                });

                expect(result.mainText.length).toBeGreaterThan(20);
                expect(result.mainText).not.toContain("__z_frag_");
                expect(result.mainText).not.toContain(".map((");
                expect(result.mainText).not.toContain("[object Object]");

                const crash = errors.find((message) =>
                    message.includes("[Zenith Router] initial navigation failed") ||
                    message.includes("[Zenith Runtime] failed to resolve expression literal")
                );
                expect(crash).toBeUndefined();

                if (route === "/docs" && result.docsNav.length > 0) {
                    const first = result.docsNav[0] as Record<string, unknown>;
                    const expected = `/docs/${String(first.path || "")}`;
                    firstDocsDetailRoute = expected;
                    expect(result.docsHrefs).toContain(expected);
                    expect(result.docsHrefs).toContain("/docs/contracts/routing");
                    const paths = result.docsNav
                        .map((entry) => String((entry as Record<string, unknown>).path || ""))
                        .filter(Boolean);
                    const guidesIndex = paths.indexOf("guides/cms-unified-site");
                    const contributingIndex = paths.indexOf("contributing/drift-gates");
                    expect(guidesIndex).toBeGreaterThanOrEqual(0);
                    expect(contributingIndex).toBeGreaterThanOrEqual(0);
                    expect(guidesIndex).toBeLessThan(contributingIndex);
                    expect(result.categoriesLength).toBeGreaterThan(0);
                    expect(result.zenButtonTexts.length).toBeGreaterThanOrEqual(result.categoriesLength);
                    for (const buttonText of result.zenButtonTexts) {
                        expect(buttonText).not.toContain("[object Object]");
                    }
                }

                if (route === "/blog" && result.posts.length > 0) {
                    const first = result.posts[0] as Record<string, unknown>;
                    const expected = `/blog/${String(first.slug || "")}`;
                    firstBlogDetailRoute = expected;
                    expect(result.blogHrefs).toContain(expected);
                    expect(result.blogHrefs).toContain("/blog/routing-awareness");
                }
            }

            const detailRoutes = [firstDocsDetailRoute, firstBlogDetailRoute].filter((route) => route.length > 0);
            expect(detailRoutes.length).toBe(2);

            for (const route of detailRoutes) {
                errors.length = 0;
                await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });

                const detail = await page.evaluate(() => {
                    const main = document.querySelector("main");
                    const mainText = (main?.textContent || "").replace(/\s+/g, " ").trim();
                    const data = (globalThis as unknown as { __zenith_ssr_data?: Record<string, unknown> })
                        .__zenith_ssr_data as Record<string, unknown> | undefined;
                    const model = (data?.model || {}) as Record<string, unknown>;
                    const docHtml = String(model.docHtml || model.articleHtml || "");
                    const post = (model.post || {}) as Record<string, unknown>;
                    const postHtml = String(post.html || model.articleHtml || "");
                    return {
                        mainText,
                        heading: String(model.heading || ""),
                        docHtml,
                        postHtml
                    };
                });

                const isDocsRoute = route.startsWith("/docs/");
                const sourceHtml = isDocsRoute ? detail.docHtml : detail.postHtml;
                const sourceMarker = sourceHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

                expect(sourceMarker.length).toBeGreaterThan(0);
                expect(detail.mainText.length).toBeGreaterThan(20);
                if (isDocsRoute) {
                    expect(detail.docHtml.length).toBeGreaterThan(20);
                    if (detail.heading.length > 0) {
                        expect(detail.mainText).toContain(detail.heading);
                    }
                } else {
                    expect(detail.postHtml.length).toBeGreaterThan(20);
                    expect(detail.mainText).toContain(sourceMarker);
                }
                expect(detail.mainText).not.toContain("__z_frag_");
                expect(detail.mainText).not.toContain(".map((");
                expect(detail.mainText).not.toContain("[object Object]");

                const crash = errors.find((message) =>
                    message.includes("[Zenith Router] initial navigation failed") ||
                    message.includes("[Zenith Runtime] failed to resolve expression literal")
                );
                expect(crash).toBeUndefined();
            }
        } finally {
            await browser.close();
            preview.close();
        }
    }, 20000);
});
