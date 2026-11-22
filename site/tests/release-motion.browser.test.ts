import { describe, expect, test } from "bun:test";
import { chromium } from "playwright";
import { startSiteDevServer } from "./helpers/dev-server";

describe("release motion in a browser", () => {
  test("the first visit animates, finishes and keeps later visits available", async () => {
    const server = process.env.ZENITH_SITE_TEST_ORIGIN ? null : await startSiteDevServer(4148);
    const origin = process.env.ZENITH_SITE_TEST_ORIGIN || "http://localhost:4148";
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        const phases = new Set<string>();
        Object.assign(window, { observedIntroPhases: phases });
        new MutationObserver(() => {
          const phase = document.documentElement?.dataset.zenithIntroState;
          if (phase) phases.add(phase);
        }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-zenith-intro-state"] });
      });
      await page.goto(origin);
      await page.waitForFunction(() => document.documentElement.dataset.zenithIntroState === "complete");
      const phases = () => page.evaluate(() => [...(window as Window & { observedIntroPhases: Set<string> }).observedIntroPhases]);
      expect(await phases()).toContain("movingLogo");
      expect(await page.locator("main").isVisible()).toBe(true);
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.zenithIntroState === "complete");
      expect(await phases()).not.toContain("movingLogo");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.zenithIntroState === "complete");
      expect(await phases()).not.toContain("movingLogo");
      expect(await page.locator("main").getAttribute("inert")).toBeNull();
    } finally {
      await browser.close();
      await server?.stop();
    }
  }, 120_000);
});
