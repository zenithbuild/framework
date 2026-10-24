import { startSiteDevServer } from "./helpers/dev-server";
import { describe, expect, test } from "bun:test";

const PORT = 4016;
const origin = `http://localhost:${PORT}`;

async function startDevServer() {
  return startSiteDevServer(PORT);
}

async function waitForHome(page: import("playwright").Page) {
  await page.waitForFunction(
    () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("main")!).pointerEvents === "auto",
    undefined,
    { timeout: 15_000 },
  );
}

async function waitForTransition(page: import("playwright").Page) {
  await page.waitForFunction(
    () => document.querySelector("[data-route-transition='true']")?.getAttribute("data-route-transition-phase") === "complete",
    undefined,
    { timeout: 30_000 },
  );
}

async function sponsorshipTargetsVisible(page: import("playwright").Page) {
  return page.evaluate(() => {
    const targets = [...document.querySelectorAll<HTMLElement>("[data-sponsorship-section='true'] [data-motion-target='true']")];
    return targets.length > 0 && targets.every((node) => {
      const style = getComputedStyle(node);
      return Number(style.opacity) > 0.98 && style.visibility === "visible";
    });
  });
}

describe("Home section refinement playback", () => {
  test("keeps the restored package rail, sponsorship, contributors, and scroll motion stable through SPA return", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    try {
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await waitForHome(page);

      const publicPackages = await page.locator("[data-precision-package-rail='true'] ul[aria-label] li").allTextContents();
      expect(publicPackages.join(" ")).toContain("@zenithbuild/compiler");
      expect(publicPackages.join(" ")).toContain("@zenithbuild/runtime");
      expect(publicPackages.join(" ")).toContain("zenithbuild");
      expect(await page.locator("[data-precision-package-rail='true'] ul[aria-hidden='true']").count()).toBe(1);
      expect(await page.locator("[data-motion-section='home-precision']").textContent()).toContain("Engineered for precision");
      expect(await page.getByText("Every package. One release train.", { exact: true }).count()).toBe(0);

      const rail = page.locator("[data-precision-package-rail='true']");
      await rail.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_300);
      await page.waitForFunction(() => {
        const transform = getComputedStyle(document.querySelector("[data-precision-package-track='true']")!).transform;
        return transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)";
      }, undefined, { timeout: 10_000 });
      await rail.hover();
      await page.waitForFunction(() => document.querySelector("[data-precision-package-rail='true']")?.getAttribute("data-precision-rail-state") === "paused");
      await page.waitForTimeout(300);
      expect(await rail.getAttribute("data-precision-rail-state")).toBe("paused");
      const pausedTransform = await page.locator("[data-precision-package-track='true']").evaluate((node) => getComputedStyle(node).transform);
      await page.waitForTimeout(500);
      expect(await page.locator("[data-precision-package-track='true']").evaluate((node) => getComputedStyle(node).transform)).toBe(pausedTransform);
      await rail.focus();
      await page.waitForTimeout(150);

      // The Framework Surface tab section was retired in favour of the sponsorship invitation;
      // home-section-refinement.test.ts asserts index.zen no longer renders <FrameworkSurface>.

      const sponsor = page.locator("[data-sponsorship-section='true']");
      await sponsor.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_100);
      expect(await sponsor.textContent()).toContain("Become Zenith’s first sponsor.");
      expect(await sponsor.textContent()).not.toContain("Compiler ownership");
      expect(await sponsor.locator("a[href='https://github.com/sponsors/zenithbuild']").count()).toBe(1);

      const contributors = page.locator("[data-contributors-section='true']");
      await contributors.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_400);
      expect(await contributors.getByText("Judah Sullivan", { exact: true }).count()).toBe(0);
      expect(await contributors.getByText("Repository contributor", { exact: true }).count()).toBe(0);
      const contributorState = await page.evaluate(() => {
        const avatars = [...document.querySelectorAll<HTMLElement>("[data-contributor-avatar-group='true'] a")];
        const images = [...document.querySelectorAll<HTMLImageElement>("[data-contributor-avatar-group='true'] img")];
        return {
          avatars: avatars.map((avatar) => {
            const style = getComputedStyle(avatar);
            const bounds = avatar.getBoundingClientRect();
            return { opacity: Number(style.opacity), visible: style.visibility === "visible", clipPath: style.clipPath, width: bounds.width, height: bounds.height };
          }),
          imagesReady: images.every((image) => image.complete && ((image.naturalWidth || 0) > 0 || image.classList.contains("hidden"))),
        };
      });
      expect(contributorState.avatars).toHaveLength(3);
      expect(contributorState.avatars.every((avatar) => avatar.opacity > 0.98 && avatar.visible && (avatar.clipPath === "none" || avatar.clipPath === "") && avatar.width >= 48 && avatar.width <= 64 && avatar.height >= 48 && avatar.height <= 64)).toBe(true);
      expect(contributorState.imagesReady).toBe(true);

      await page.locator("[data-nav-shell='true'] a[href='/blog']").first().click();
      await page.waitForURL(`${origin}/blog`);
      await waitForTransition(page);
      await page.locator("[data-nav-shell='true'] a[href='/']").first().click();
      await page.waitForURL(`${origin}/`);
      await waitForTransition(page);
      // The SPA return must restore exactly one sponsorship section and leave it visible.
      expect(await page.locator("[data-sponsorship-section='true']").count()).toBe(1);
      await page.locator("[data-sponsorship-section='true']").scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_300);
      // Assert on the animated targets; the section root itself is never hidden by the motion.
      expect(await sponsorshipTargetsVisible(page)).toBe(true);

      const themeToggle = page.getByRole("button", { name: /theme/i });
      const beforeTheme = await themeToggle.getAttribute("aria-label");
      await themeToggle.click();
      await page.waitForFunction((label) => document.querySelector("[data-zen-theme-toggle='true']")?.getAttribute("aria-label") !== label, beforeTheme);

      for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1680, height: 960 }]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }

      const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const reducedPage = await reducedContext.newPage();
      await reducedPage.goto(`${origin}/`, { waitUntil: "networkidle" });
      await waitForHome(reducedPage);
      expect(await reducedPage.locator("[data-precision-package-track='true']").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
      await reducedPage.locator("[data-sponsorship-section='true']").scrollIntoViewIfNeeded();
      await reducedPage.waitForTimeout(300);
      expect(await sponsorshipTargetsVisible(reducedPage)).toBe(true);
      await reducedContext.close();
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.stop();
    }
  }, 660_000);
});
