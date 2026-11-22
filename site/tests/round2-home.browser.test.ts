import { describe, expect, test } from "bun:test";
import { chromium } from "playwright";
import { startSiteDevServer } from "./helpers/dev-server";

describe("Round 2 Home", () => {
  test("uses the design fonts and metrics and keeps the compact code usable", async () => {
    const port = 4149;
    const server = process.env.ZENITH_SITE_TEST_ORIGIN ? null : await startSiteDevServer(port);
    const origin = process.env.ZENITH_SITE_TEST_ORIGIN || `http://localhost:${port}`;
    const browser = await chromium.launch();
    try {
      for (const width of [390, 1440]) {
        const mobile = width === 390;
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error" && /Zenith (?:Runtime|Router)/.test(message.text())) errors.push(message.text()); });
        await page.goto(origin);
        await page.waitForFunction(() => document.documentElement.dataset.zenithIntroState === "complete");
        await page.evaluate(() => document.fonts.ready);
        const heading = page.locator("#hero-title");
        const type = await heading.evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.fontFamily.split(",")[0].replaceAll('"', ""), style.fontWeight, style.fontSize, style.lineHeight, style.letterSpacing];
        });
        expect(type).toEqual(["Bricolage Grotesque", "600", mobile ? "52px" : "76px", mobile ? "52px" : "72px", mobile ? "-1.56px" : "-2.28px"]);
        const faces = await page.evaluate(() => [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family.replaceAll('"', "")));
        for (const face of ["Bricolage Grotesque", "Roboto", "IBM Plex Mono"]) expect(faces).toContain(face);
        const panel = await page.locator("[data-hero-panel]").boundingBox();
        const install = await page.locator("[data-hero-start] .copy-box").boundingBox();
        expect([panel?.width, panel?.height]).toEqual(mobile ? [358, 296] : [712, 504]);
        expect([install?.width, install?.height]).toEqual(mobile ? [358, 48] : [520, 48]);
        const pipeline = await page.locator("#how-it-works").boundingBox();
        expect(pipeline?.y).toBe(mobile ? 859 : 713);
        if (mobile) {
          const expand = page.getByRole("button", { name: "Show all 12 lines" });
          await expand.click();
          expect(await page.getByRole("button", { name: "Show fewer lines", exact: true }).getAttribute("aria-expanded")).toBe("true");
          await page.getByRole("tab", { name: "Failing build" }).click();
          await page.waitForFunction(() => document.querySelector("[data-hero-panel]")?.getAttribute("data-hero-state") === "failed");
          await page.getByRole("button", { name: "Reset" }).click();
          await page.waitForFunction(() => document.querySelector("[data-hero-panel]")?.getAttribute("data-hero-state") === "compiled");
        }
        expect(errors).toEqual([]);
        await page.close();
      }
    } finally {
      await browser.close();
      await server?.stop();
    }
  }, 150_000);
});
