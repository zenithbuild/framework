import { describe, expect, test } from "bun:test";

const PORT = 4032;
const origin = `http://localhost:${PORT}`;

async function startDevServer(): Promise<{ kill: () => void }> {
  const { spawn } = await import("node:child_process");
  const http = await import("node:http");
  const dev = spawn("npx", ["zenith", "dev", "--port", String(PORT)], {
    cwd: import.meta.dir + "/..",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ZENITH_BLOG_SOURCE: "git", ZENITH_DOCUMENTATION_SOURCE: "local" },
  });
  const status = () =>
    new Promise<number>((resolve) => {
      const request = http.get(origin, (response) => {
        response.resume();
        resolve(response.statusCode || 0);
      });
      request.on("error", () => resolve(0));
      request.setTimeout(2_000, () => {
        request.destroy();
        resolve(0);
      });
    });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if ((await status()) === 200) return { kill: () => dev.kill() };
  }
  dev.kill();
  throw new Error("Search modal dev server failed to start");
}

describe("SearchModal browser integration", () => {
  test(
    "scoped filters work with real markup and no runtime errors",
    async () => {
      const { chromium } = await import("playwright");
      const server = await startDevServer();
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors: string[] = [];
      const failedResources: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400) failedResources.push(response.url());
      });

      async function openScopedModal(url: string, scope: string, scopeLabel: string, expectedTriggers: number) {
        await page.goto(`${origin}${url}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        const trigger = page.locator(`[data-search-trigger][data-search-scope="${scope}"]`).first();
        expect(await trigger.count()).toBeGreaterThan(0);
        await trigger.click();
        await page.waitForTimeout(400);
        const dialog = page.locator('[data-search-dialog]');
        expect(await dialog.getAttribute("aria-label")).toBe(scopeLabel);
        expect(await page.locator('[data-filter-trigger]').count()).toBe(expectedTriggers);
      }

      // Docs scope: open section filter, keyboard navigate, select an option.
      await openScopedModal("/docs", "docs", "Documentation", 2);
      await page.locator('[data-filter-trigger="section"]').click();
      await page.waitForTimeout(200);
      const sectionOptions = page.locator('[data-filter-name="section"][data-filter-option]');
      expect(await sectionOptions.count()).toBeGreaterThan(0);
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      expect(await page.locator('[data-filter-trigger="section"]').getAttribute("aria-expanded")).toBe("false");

      // Search "compiler" in docs scope and verify every visible result mentions it.
      await page.locator('[data-search-input]').fill("compiler");
      await page.waitForTimeout(600);
      const docsCount = await page.locator('[data-search-result-count]').textContent();
      expect(docsCount).toMatch(/result/);
      const docsResults = await page.locator('[data-search-result-item]').all();
      expect(docsResults.length).toBeGreaterThan(0);
      const someDocsContainQuery = docsResults.some(async (result) => {
        const text = await result.textContent();
        return text?.toLowerCase().includes("compiler");
      });
      expect(someDocsContainQuery).toBe(true);

      // Close modal and switch to blog scope.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      await openScopedModal("/blog", "blog", "Blog", 4);
      await page.locator('[data-filter-trigger="category"]').click();
      await page.waitForTimeout(200);
      expect(await page.locator('[data-filter-name="category"][data-filter-option]').count()).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      expect(await page.locator('[data-filter-trigger="category"]').getAttribute("aria-expanded")).toBe("false");

      // Global scope from home.
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.locator('[data-search-trigger][data-search-scope="global"]').first().click();
      await page.waitForTimeout(400);
      expect(await page.locator('[data-search-dialog]').getAttribute("aria-label")).toBe("Search the site");
      expect(await page.locator('[data-filter-trigger]').count()).toBe(0);
      await page.locator('[data-search-input]').fill("compiler");
      await page.waitForTimeout(600);
      const globalCount = await page.locator('[data-search-result-count]').textContent();
      expect(globalCount).toMatch(/result/);
      expect(await page.locator('[data-search-result-item]').count()).toBeGreaterThan(0);

      await browser.close();
      server.kill();

      expect(errors).toEqual([]);
      expect(failedResources).toEqual([]);
    },
    { timeout: 120_000 },
  );
});
