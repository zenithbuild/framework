import { describe, expect, test } from "bun:test";

const PORT = 4022;
const origin = `http://localhost:${PORT}`;

async function startDevServer(): Promise<{ kill: () => void }> {
  const { spawn } = await import("node:child_process");
  const http = await import("node:http");
  const dev = spawn("npx", ["zenith", "dev", "--port", String(PORT)], {
    cwd: import.meta.dir + "/..",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ZENITH_BLOG_SOURCE: "git", ZENITH_DOCUMENTATION_SOURCE: "local" },
  });
  const status = () => new Promise<number>((resolve) => {
    const request = http.get(origin, (response) => { response.resume(); resolve(response.statusCode || 0); });
    request.on("error", () => resolve(0));
    request.setTimeout(2_000, () => { request.destroy(); resolve(0); });
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await status() === 200) return { kill: () => dev.kill() };
  }
  dev.kill();
  throw new Error("CMS content dev server failed to start");
}

describe("Tina-managed committed content routes", () => {
  test("renders Blog, Docs, About, sponsorship, and people through direct loads and browser history", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    try {
      const blogResponse = await page.goto(`${origin}/blog`, { waitUntil: "networkidle" });
      expect(blogResponse?.status()).toBe(200);
      expect(await page.getByRole("heading", { name: "Notes from inside the framework." }).count()).toBe(1);
      expect(await page.locator('a[href="/blog/building-zenith-0-8"]').count()).toBeGreaterThan(0);

      await page.goto(`${origin}/blog/building-zenith-0-8`, { waitUntil: "networkidle" });
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toContain("Building Zenith 0.8");
      expect(await page.getByRole("navigation", { name: "Article sections" }).getByRole("link").count()).toBeGreaterThan(0);
      await page.goBack({ waitUntil: "networkidle" });
      expect(page.url()).toBe(`${origin}/blog`);

      const dynamicPost = await page.goto(`${origin}/blog/server-truth-before-client-convenience`, { waitUntil: "networkidle" });
      expect(dynamicPost?.status()).toBe(200);
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toContain("Server truth before client convenience");

      const docsResponse = await page.goto(`${origin}/docs/routing/route-protection`, { waitUntil: "networkidle" });
      expect(docsResponse?.status()).toBe(200);
      expect(await page.textContent("body")).toContain("Route Protection");
      expect(await page.textContent("body")).toContain("docs/documentation/routing/route-protection.md");
      expect(await page.getByRole("navigation", { name: "On this page" }).getByRole("link").count()).toBeGreaterThan(0);

      const missing = await page.goto(`${origin}/blog/not-a-real-post`, { waitUntil: "networkidle" });
      expect(missing?.status()).toBe(404);
      expect((await page.textContent("body"))?.trim().length).toBeGreaterThan(0);

      await page.goto(`${origin}/about`, { waitUntil: "networkidle" });
      expect(await page.textContent("body")).toContain("Direct web development again.");

      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      expect(await page.locator("[data-sponsorship-section='true']").textContent()).toContain("Become Zenith’s first sponsor.");
      const contributors = page.locator("[data-contributor-avatar-group='true']");
      expect(await contributors.locator("a").count()).toBe(3);
      expect(await contributors.locator('a[aria-label="View Jonathan Streetman\'s profile"]').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      server.kill();
    }
  }, 120_000);
});
