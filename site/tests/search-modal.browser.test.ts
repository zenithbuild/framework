import { describe, expect, test } from "bun:test";
import { chromium } from "playwright";
import { startSiteDevServer } from "./helpers/dev-server";

describe("Global search", () => {
  test("loads suggestions, searches the index, and navigates by keyboard from public pages", async () => {
    const port = 4032;
    const origin = process.env.ZENITH_SITE_TEST_ORIGIN || `http://localhost:${port}`;
    const server = process.env.ZENITH_SITE_TEST_ORIGIN ? null : await startSiteDevServer(port);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      for (const path of ["/docs", "/blog", "/"]) {
        await page.goto(origin + path, { waitUntil: "networkidle" });
        const opener = page.getByRole("button", { name: "Search", exact: true });
        await opener.click();
        const dialog = page.getByRole("dialog", { name: /^Search( the site)?$/ });
        const input = dialog.getByRole("combobox");
        await input.waitFor();
        const options = dialog.getByRole("option");
        await options.first().waitFor();
        expect(await options.count()).toBe(3);
        await input.fill("compiler");
        await page.waitForFunction(() => (document.querySelector("[data-search-result-count]")?.textContent || "").trim().match(/^[1-9]\d* results?$/) && document.querySelectorAll("[data-search-result-item]").length > 3);
        expect((await dialog.locator("[data-search-result-count]").textContent())?.trim()).toBe(`${await options.count()} results`);
        await input.press("ArrowDown");
        const selected = dialog.locator('[role="option"][aria-selected="true"]');
        const href = await selected.getAttribute("href");
        expect(href).toMatch(/^\//);
        await input.press("Enter");
        await page.waitForURL(origin + href);
        await page.getByRole("heading", { level: 1 }).waitFor();
        await page.keyboard.press("/");
        await input.waitFor();
        await input.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server?.stop();
    }
  }, 150_000);
});
