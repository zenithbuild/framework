import { describe, expect, test } from "bun:test";
import { chromium } from "playwright";
import { startSiteDevServer } from "./helpers/dev-server";

describe("Blog landing page", () => {
  test("shows the feature first and keeps archive filters in the URL and browser history", async () => {
    const port = 4031;
    const origin = process.env.ZENITH_SITE_TEST_ORIGIN || `http://localhost:${port}`;
    const server = process.env.ZENITH_SITE_TEST_ORIGIN ? null : await startSiteDevServer(port);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(origin + "/blog");
      const rows = page.locator("[data-blog-article-row]");
      await rows.last().waitFor();
      expect(await rows.count()).toBe(4);
      const first = await page.locator("[data-blog-featured], [data-blog-archive]").first().getAttribute("data-blog-featured");
      expect(first).not.toBeNull();
      const filters = page.getByRole("group", { name: "Filter by category" });
      expect(await filters.getAttribute("action")).toBe("/blog");
      expect(await filters.getByRole("button", { name: "All", exact: true }).getAttribute("name")).toBeNull();
      for (const label of ["Framework", "Routing"]) {
        expect(await filters.getByRole("button", { name: label, exact: true }).getAttribute("value")).toBe(label);
        await filters.getByRole("button", { name: label, exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("category") === label);
        await page.waitForFunction(() => document.querySelectorAll("[data-blog-article-row]").length === 1);
        expect(await rows.first().getAttribute("data-blog-category")).toBe(label);
        expect((await page.locator("[data-blog-result-count]").textContent())?.trim()).toBe("1 article");
      }
      await page.goBack();
      await filters.getByRole("button", { name: "Framework", pressed: true, exact: true }).waitFor();
      await page.reload();
      await filters.getByRole("button", { name: "Framework", pressed: true, exact: true }).waitFor();
      const post = rows.first().getByRole("link");
      const href = await post.getAttribute("href");
      await post.click();
      await page.waitForURL(origin + href);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.goBack();
      await filters.getByRole("button", { name: "All", exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll("[data-blog-article-row]").length === 4);
      expect(new URL(page.url()).searchParams.has("category")).toBe(false);

      // Exercise the browser's form action before a restored page can handle submissions.
      await page.evaluate(() => {
        window.addEventListener("submit", (event) => event.stopImmediatePropagation(), { capture: true, once: true });
      });
      await filters.getByRole("button", { name: "Routing", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("category") === "Routing");
      await filters.getByRole("button", { name: "Routing", pressed: true, exact: true }).waitFor();
      expect(await rows.count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server?.stop();
    }
  }, 150_000);
});
