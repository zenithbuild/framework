import { describe, expect, test } from "bun:test";
import { chromium } from "playwright";
import { startSiteDevServer } from "./helpers/dev-server";

describe("release motion in a browser", () => {
  test("flips both phrases around a centered mark, then releases the page once per tab", async () => {
    const server = process.env.ZENITH_SITE_TEST_ORIGIN ? null : await startSiteDevServer(4148);
    const origin = process.env.ZENITH_SITE_TEST_ORIGIN || "http://localhost:4148";
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        const motion = { phases: [] as string[], phrases: [] as string[], distance: 0, samples: 0, flipped: false };
        Object.assign(window, { observedIntro: motion });
        function sample() {
          const phase = document.documentElement?.dataset.zenithIntroState;
          if (phase && !motion.phases.includes(phase)) motion.phases.push(phase);
          if (phase === "complete") return;
          const loader = document.querySelector("[data-home-intro-root]");
          const label = loader?.querySelector("[data-transition-label]");
          const words = Array.from(label?.querySelectorAll(".zenith-intro-word") || []);
          if (words.length) {
            const phrase = words.map((word) => word.textContent?.trim()).join(" ");
            if (!motion.phrases.includes(phrase)) motion.phrases.push(phrase);
            motion.flipped ||= words.some((word) => getComputedStyle(word).transform.startsWith("matrix3d"));
          }
          const mark = loader?.querySelector("[data-shared-nav-mark]")?.getBoundingClientRect();
          const stage = loader?.querySelector("[data-transition-artwork]")?.getBoundingClientRect();
          if (mark?.width && stage?.width && phase !== "pending") {
            const dx = mark.left + mark.width / 2 - stage.left - stage.width / 2;
            const dy = mark.top + mark.height / 2 - stage.top - stage.height / 2;
            motion.distance = Math.max(motion.distance, Math.hypot(dx, dy));
            motion.samples++;
          }
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      const done = () => page.waitForFunction(() => document.documentElement.dataset.zenithIntroState === "complete");
      const observation = () => page.evaluate(() => (window as Window & {
        observedIntro: { phases: string[]; phrases: string[]; distance: number; samples: number; flipped: boolean };
      }).observedIntro);
      await page.goto(origin);
      await done();
      const firstVisit = await observation();
      expect(firstVisit.phrases).toEqual(["Prime trusted runtime", "Compile route graph"]);
      expect(firstVisit.flipped).toBe(true);
      expect(firstVisit.samples).toBeGreaterThan(5);
      expect(firstVisit.distance).toBeLessThan(2);
      expect(firstVisit.phases).toContain("artworkExit");
      expect(firstVisit.phases).toContain("revealingContent");
      expect(await page.locator("main").getAttribute("inert")).toBeNull();
      await page.reload();
      await done();
      expect((await observation()).phrases).toEqual([]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await done();
      expect((await observation()).phrases).toEqual([]);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      for (const method of ["button", "Escape"]) {
        await page.evaluate(() => sessionStorage.clear());
        await page.reload();
        const skip = page.getByRole("button", { name: "Skip intro" });
        await skip.waitFor();
        await skip.focus();
        if (method === "button") await skip.click();
        else await page.keyboard.press("Escape");
        await done();
        expect(await page.locator("main").getAttribute("inert")).toBeNull();
        expect(await page.locator("main").evaluate((main) => main === document.activeElement)).toBe(true);
        expect(await page.getByRole("link", { name: "Zenith home" }).first().isVisible()).toBe(true);
      }
    } finally {
      await browser.close();
      await server?.stop();
    }
  }, 120_000);
});
