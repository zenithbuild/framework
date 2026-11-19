import { startSiteDevServer } from "./helpers/dev-server";
import { describe, expect, test } from "bun:test";
import blogPage from "../src/content/pages/blog.json";

const PORT = 4022;
const origin = `http://localhost:${PORT}`;

async function startDevServer() {
  return startSiteDevServer(PORT, { ZENITH_BLOG_SOURCE: "git", ZENITH_DOCUMENTATION_SOURCE: "local" });
}

describe("committed content routes", () => {
  test("renders Blog, Docs, About, and the v1 Home through direct loads and browser history", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    try {
      const blogResponse = await page.goto(`${origin}/blog`, { waitUntil: "networkidle" });
      expect(blogResponse?.status()).toBe(200);
      expect(await page.getByRole("heading", { name: blogPage.intro.title, exact: true }).count()).toBe(1);
      expect(await page.locator('a[href="/blog/building-zenith-0-8"]').count()).toBeGreaterThan(0);

      await page.goto(`${origin}/blog/building-zenith-0-8`, { waitUntil: "networkidle" });
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toContain("Building Zenith 0.8");
      expect(await page.getByRole("navigation", { name: "On this page" }).getByRole("link").count()).toBeGreaterThan(0);
      await page.goBack({ waitUntil: "networkidle" });
      expect(page.url()).toBe(`${origin}/blog`);

      const dynamicPost = await page.goto(`${origin}/blog/server-truth-before-client-convenience`, { waitUntil: "networkidle" });
      expect(dynamicPost?.status()).toBe(200);
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toContain("Server truth before client convenience");

      const docsResponse = await page.goto(`${origin}/docs/routing/route-protection`, { waitUntil: "networkidle" });
      expect(docsResponse?.status()).toBe(200);
      expect(await page.textContent("body")).toContain("Route Protection");
      // The reader shows the Tina document's frontmatter, not its repo path (sourcePath is covered in tina-cms-integration.test.ts).
      expect(await page.textContent("body")).toContain("How to securely protect Zenith routes using server-enforced guard and load exports.");
      expect(await page.getByRole("navigation", { name: "On this page" }).getByRole("link").count()).toBeGreaterThan(0);

      const missing = await page.goto(`${origin}/blog/not-a-real-post`, { waitUntil: "networkidle" });
      expect(missing?.status()).toBe(404);
      expect((await page.textContent("body"))?.trim().length).toBeGreaterThan(0);

      await page.goto(`${origin}/about`, { waitUntil: "networkidle" });
      expect(await page.textContent("body")).toContain("Direct web development again.");

      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      // v1 Home (handoff §4): hero, pipeline, Why Zenith, closing CTA. Sponsorship and contributors left Home.
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toContain("Ship interfaces");
      for (const id of ["how-it-works", "why-zenith", "get-started"]) {
        expect(await page.locator(`#${id}`).count()).toBe(1);
      }
      expect(await page.locator("[data-sponsorship-section='true']").count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.stop();
    }
  }, 660_000);
});
