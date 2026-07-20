import { describe, expect, test } from "bun:test";

const PORT = 4031;
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

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await status() === 200) return { kill: () => dev.kill() };
  }
  dev.kill();
  throw new Error("Blog landing dev server failed to start");
}

describe("Blog landing page", () => {
  test("filters the archive with stable click-controlled menus before the featured recommendation", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const expectVisible = async (locator: any) => {
      await locator.waitFor({ state: "visible" });
      expect(await locator.isVisible()).toBe(true);
    };
    const expectHidden = async (locator: any) => {
      await locator.waitFor({ state: "hidden" });
      expect(await locator.isVisible()).toBe(false);
    };
    const errors: string[] = [];
    const failedResources: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failedResources.push(response.url());
    });

    try {
      const response = await page.goto(`${origin}/blog`, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
      expect(await page.getByText("Featured post", { exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole("heading", { name: "All articles" }).isVisible()).toBe(true);
      expect(await page.locator("[data-blog-search='presentation-only'] input[readonly]").isVisible()).toBe(true);
      expect(await page.locator("[data-blog-result-count='true']").textContent()).toContain("4 posts");
      expect(await page.locator("[data-blog-article-row='true']").count()).toBe(4);
      expect(await page.locator("[data-blog-filter-trigger='category']").textContent()).toContain("All");
      expect(await page.evaluate(() => {
        const archive = document.querySelector("[data-blog-archive-browser='true']");
        const featured = document.querySelector("[data-blog-featured='true']");
        return Boolean(archive && featured && (archive.compareDocumentPosition(featured) & Node.DOCUMENT_POSITION_FOLLOWING));
      })).toBe(true);

      const categoryTrigger = page.locator("[data-blog-filter-trigger='category']");
      const categoryMenu = page.locator("[data-blog-filter-menu='category']");
      const tagTrigger = page.locator("[data-blog-filter-trigger='tag']");
      const tagMenu = page.locator("[data-blog-filter-menu='tag']");

      await categoryTrigger.click();
      await expectVisible(categoryMenu);
      await categoryTrigger.hover();
      await categoryMenu.hover();
      await expectVisible(categoryMenu);
      await page.getByRole("menuitemradio", { name: "Framework", exact: true }).click();
      await expectVisible(page.getByRole("heading", { name: "Framework", exact: true }));
      expect(await page.locator("[data-blog-result-count='true']").textContent()).toContain("1 post");
      expect(await page.locator("[data-blog-article-row='true']").count()).toBe(1);

      await tagTrigger.click();
      await page.getByRole("menuitemradio", { name: "Compiler", exact: true }).click();
      await expectVisible(page.getByRole("heading", { name: "Framework · Compiler", exact: true }));
      expect(await page.locator("[data-blog-result-count='true']").textContent()).toContain("1 post");

      await page.locator("[data-blog-filter-reset='true']").click();
      await expectVisible(page.getByRole("heading", { name: "All articles", exact: true }));
      expect(await page.locator("[data-blog-article-row='true']").count()).toBe(4);

      await categoryTrigger.click();
      await tagTrigger.click();
      await expectHidden(categoryMenu);
      await expectVisible(tagMenu);
      await page.getByRole("heading", { level: 1 }).click();
      await expectHidden(tagMenu);

      await categoryTrigger.focus();
      await categoryTrigger.press("ArrowDown");
      await expectVisible(categoryMenu);
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "All");
      await page.keyboard.press("ArrowDown");
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe("Framework");
      await page.keyboard.press("Escape");
      await expectHidden(categoryMenu);
      expect(await categoryTrigger.evaluate((element) => element === document.activeElement)).toBe(true);

      await categoryTrigger.click();
      await page.getByRole("menuitemradio", { name: "Framework", exact: true }).click();
      await tagTrigger.click();
      await page.getByRole("menuitemradio", { name: "Security", exact: true }).click();
      await expectVisible(page.locator("[data-blog-empty-state='true']"));
      expect(await page.locator("[data-blog-result-count='true']").textContent()).toContain("0 posts");
      await page.locator("[data-blog-filter-reset='true']").click();
      expect(await page.locator("[data-blog-article-row='true']").count()).toBe(4);

      expect(await page.locator('a[href="/blog/building-zenith-0-8"]').count()).toBeGreaterThan(1);
      expect(await page.locator('a[href="/blog/direct-web-development-again"]').count()).toBeGreaterThan(0);
      expect(await page.locator('a[href="/blog/server-truth-before-client-convenience"]').count()).toBeGreaterThan(0);
      expect(await page.locator('a[href="/blog/tooling-that-answers-to-the-compiler"]').count()).toBeGreaterThan(0);

      await page.setViewportSize({ width: 390, height: 844 });
      await tagTrigger.click();
      await expectVisible(tagMenu);
      const mobileMenuBox = await tagMenu.boundingBox();
      expect(mobileMenuBox && mobileMenuBox.x >= 0 && mobileMenuBox.x + mobileMenuBox.width <= 391).toBe(true);
      await page.getByRole("menuitemradio", { name: "Routing", exact: true }).click();
      expect(await page.locator("[data-blog-result-count='true']").textContent()).toContain("2 posts");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await page.locator('a[href="/blog/server-truth-before-client-convenience"]').first().click();
      await page.waitForURL(`${origin}/blog/server-truth-before-client-convenience`);
      const articleHeading = page.getByRole("heading", { level: 1, name: "Server truth before client convenience" });
      await articleHeading.waitFor({ state: "visible" });
      expect(await articleHeading.isVisible()).toBe(true);

      await page.goto(`${origin}/blog`, { waitUntil: "networkidle" });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
      // Existing CLI public-asset handling does not serve src/public/logo.png in dev.
      expect(failedResources.filter((url) => new URL(url).pathname !== "/logo.png")).toEqual([]);
    } finally {
      await browser.close();
      server.kill();
    }
  }, 120_000);
});
