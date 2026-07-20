import { describe, expect, test } from "bun:test";

const PORT = 4033;
const origin = `http://localhost:${PORT}`;

async function startDevServer(): Promise<{ kill: () => void }> {
  const { spawn } = await import("node:child_process");
  const http = await import("node:http");
  const dev = spawn("npx", ["zenith", "dev", "--port", String(PORT)], {
    cwd: import.meta.dir + "/..",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ZENITH_BLOG_SOURCE: "git", ZENITH_DOCUMENTATION_SOURCE: "local", ZENITH_SITE_ORIGIN: "https://zenithbuild.dev" },
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
  throw new Error("Navigation and Blog detail dev server failed to start");
}

describe("shared navigation and Blog detail", () => {
  test("keeps menus reachable and tracks the real article reading position", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) runtimeErrors.push(message.text());
    });

    try {
      await page.goto(`${origin}/blog/building-zenith-0-8`, { waitUntil: "networkidle" });

      const desktopTrigger = page.locator("[data-nav-dropdown-trigger='true']");
      const desktopPanel = page.locator("[data-nav-dropdown-panel='true']");
      await desktopTrigger.click();
      await desktopPanel.waitFor({ state: "visible" });
      await desktopTrigger.hover();
      await desktopPanel.hover();
      await page.waitForTimeout(250);
      expect(await desktopPanel.isVisible()).toBe(true);
      expect(await desktopPanel.getByRole("menuitem").count()).toBe(3);
      await desktopTrigger.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menuitem");
      await page.keyboard.press("Escape");
      await desktopPanel.waitFor({ state: "hidden" });
      expect(await desktopTrigger.evaluate((element) => element === document.activeElement)).toBe(true);

      await desktopTrigger.click();
      await page.mouse.click(1200, 320);
      await desktopPanel.waitFor({ state: "hidden" });
      await desktopTrigger.click();
      await desktopPanel.getByRole("menuitem", { name: /Documentation/ }).click();
      await page.waitForURL(`${origin}/docs`);
      expect(await page.locator("[data-nav-dropdown-panel='true']").isVisible()).toBe(false);

      await page.goto(`${origin}/blog/building-zenith-0-8`, { waitUntil: "networkidle" });
      const articleHeadings = page.locator("[data-blog-article='true'] h2, [data-blog-article='true'] h3");
      const tocLinks = page.locator("[data-reader-toc='blog'] [data-reader-heading-link]");
      const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(new URL(canonicalHref || origin).pathname).toBe("/blog/building-zenith-0-8");
      expect(await articleHeadings.count()).toBe(3);
      expect(await tocLinks.count()).toBe(await articleHeadings.count());
      const headingIds = await articleHeadings.evaluateAll((elements) => elements.map((element) => element.id));
      const tocHrefs = await tocLinks.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
      expect(tocHrefs).toEqual(headingIds.map((id) => `#${id}`));

      for (let index = 0; index < headingIds.length; index += 1) {
        const id = headingIds[index];
        await tocLinks.nth(index).click();
        await page.waitForFunction((expected) => window.location.hash === `#${expected}`, id);
        expect(await tocLinks.nth(index).getAttribute("aria-current")).toBe("location");
        const top = await page.locator(`#${id}`).evaluate((element) => element.getBoundingClientRect().top);
        expect(top).toBeGreaterThanOrEqual(64);
      }

      await page.setViewportSize({ width: 1440, height: 500 });
      await page.locator(`#${headingIds.at(-1)}`).evaluate((element) => element.scrollIntoView({ behavior: "instant", block: "start" }));
      await page.waitForFunction((id) => document.querySelector(`[data-reader-heading-link='${id}']`)?.getAttribute("aria-current") === "location", headingIds.at(-1));
      await page.locator(`#${headingIds[0]}`).evaluate((element) => element.scrollIntoView({ behavior: "instant", block: "start" }));
      await page.waitForFunction((id) => document.querySelector(`[data-reader-heading-link='${id}']`)?.getAttribute("aria-current") === "location", headingIds[0]);

      await page.locator("[data-reader-article-end='blog']").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const links = Array.from(document.querySelectorAll("[data-reader-heading-link]"));
        return links.at(-1)?.getAttribute("aria-current") === "location";
      });

      const directId = headingIds[1];
      await page.goto(`${origin}/blog/building-zenith-0-8#${directId}`, { waitUntil: "networkidle" });
      const directLink = page.locator(`[data-reader-heading-link='${directId}']`);
      expect(await directLink.getAttribute("aria-current")).toBe("location");
      await page.waitForFunction((id) => {
        const heading = document.getElementById(id);
        if (!heading) return false;
        const top = heading.getBoundingClientRect().top;
        return top >= 64 && top < 180;
      }, directId);
      const directTop = await page.locator(`#${directId}`).evaluate((element) => element.getBoundingClientRect().top);
      expect(directTop).toBeGreaterThanOrEqual(64);

      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
      await page.setViewportSize({ width: 768, height: 900 });
      expect(await page.locator("[data-reader-toc='blog']").isVisible()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.locator("[data-reader-toc='blog']").isVisible()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      const mobileTrigger = page.locator("[data-mobile-nav-trigger='true']");
      const mobileDocsTrigger = page.locator("[data-mobile-nav-disclosure='docs']");
      const mobileDocsPanel = page.locator("[data-mobile-nav-panel='docs']");
      await mobileTrigger.click();
      await mobileDocsTrigger.click();
      await mobileDocsPanel.waitFor({ state: "visible" });
      expect(await mobileDocsPanel.getByRole("link").count()).toBe(3);
      await page.keyboard.press("Escape");
      await mobileDocsPanel.waitFor({ state: "hidden" });
      expect(await mobileDocsTrigger.evaluate((element) => element === document.activeElement)).toBe(true);
      expect(await page.locator("#mobile-navigation").isVisible()).toBe(true);
      await page.keyboard.press("Escape");
      expect(await page.locator("#mobile-navigation").isVisible()).toBe(false);
      expect(await mobileTrigger.evaluate((element) => element === document.activeElement)).toBe(true);
      expect(runtimeErrors).toEqual([]);
    } finally {
      await browser.close();
      server.kill();
    }
  }, 120_000);
});
