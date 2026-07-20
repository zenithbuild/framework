import { describe, expect, test } from "bun:test";

const PORT = 4016;
const origin = `http://localhost:${PORT}`;

async function startDevServer(): Promise<{ kill: () => void }> {
  const { spawn } = await import("child_process");
  const http = await import("http");
  const dev = spawn("npx", ["zenith", "dev", "--port", String(PORT)], {
    cwd: import.meta.dir + "/..",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const check = () => new Promise<number>((resolve) => {
    const request = http.get(origin, (response) => { response.resume(); resolve(response.statusCode || 0); });
    request.on("error", () => resolve(0));
    request.setTimeout(2_000, () => { request.destroy(); resolve(0); });
  });

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (await check() === 200) return { kill: () => dev.kill() };
  }
  dev.kill();
  throw new Error("Home refinement dev server failed to start");
}

async function waitForHome(page: import("playwright").Page) {
  await page.waitForFunction(
    () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("main")!).pointerEvents === "auto",
    { timeout: 15_000 },
  );
}

async function waitForTransition(page: import("playwright").Page) {
  await page.waitForFunction(
    () => document.querySelector("[data-route-transition='true']")?.getAttribute("data-route-transition-phase") === "complete",
    { timeout: 30_000 },
  );
}

describe("Home section refinement playback", () => {
  test("keeps the restored package rail, Framework Surface, sponsorship, contributors, and scroll motion stable through SPA return", async () => {
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
      }, { timeout: 10_000 });
      await rail.hover();
      await page.waitForFunction(() => document.querySelector("[data-precision-package-rail='true']")?.getAttribute("data-precision-rail-state") === "paused");
      await page.waitForTimeout(300);
      expect(await rail.getAttribute("data-precision-rail-state")).toBe("paused");
      const pausedTransform = await page.locator("[data-precision-package-track='true']").evaluate((node) => getComputedStyle(node).transform);
      await page.waitForTimeout(500);
      expect(await page.locator("[data-precision-package-track='true']").evaluate((node) => getComputedStyle(node).transform)).toBe(pausedTransform);
      await rail.focus();
      await page.waitForTimeout(150);

      const framework = page.locator("[data-framework-surface='true']");
      await framework.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_200);
      const initialLayout = await page.evaluate(() => {
        const stage = document.querySelector("[data-framework-detail='true']")!.getBoundingClientRect();
        const framework = document.querySelector("[data-framework-surface='true']")!.getBoundingClientRect();
        const sponsor = document.querySelector("[data-sponsorship-section='true']")!.getBoundingClientRect();
        const labels = [...document.querySelectorAll<HTMLElement>("[data-framework-surface='true'] [role='tab']")].map((label) => {
          const bounds = label.getBoundingClientRect();
          return { top: bounds.top + window.scrollY, left: bounds.left, width: bounds.width, height: bounds.height };
        });
        return { stageHeight: stage.height, stageWidth: stage.width, frameworkHeight: framework.height, sponsorTop: sponsor.top + window.scrollY, labels };
      });

      const expectedDetails = [
        "Structure and binding intent are resolved before the browser takes over.",
        "Pathname selects the route. The server decides protected outcomes.",
        "Use the primitive that matches the ownership boundary.",
        "Security and data stay route-owned.",
        "Compiler, bundler, runtime, router, and CLI move on one train.",
      ];
      const accordionIds = ["compiler", "router", "reactivity", "server", "toolchain"];
      for (let index = 0; index < accordionIds.length; index += 1) {
        const control = page.locator(`#feature-tab-${accordionIds[index]}`);
        await control.click();
        await page.waitForFunction((id) => document.querySelector(id)?.getAttribute("aria-selected") === "true", `#feature-tab-${accordionIds[index]}`);
        await page.waitForFunction((detail) => document.querySelector("[data-framework-detail='true']")?.textContent?.includes(detail), expectedDetails[index]);
      }
      const routerControl = page.locator("#feature-tab-router");
      await routerControl.focus();
      await routerControl.press("Enter");
      await page.waitForFunction(() => document.querySelector("#feature-tab-router")?.getAttribute("aria-selected") === "true");
      await page.locator("#feature-tab-compiler").click();
      await page.locator("#feature-tab-server").click();
      await page.locator("#feature-tab-toolchain").click();
      await page.waitForFunction(() => document.querySelector("#feature-tab-toolchain")?.getAttribute("aria-selected") === "true");
      await page.waitForTimeout(900);
      const settledLayout = await page.evaluate(() => {
        const stage = document.querySelector("[data-framework-detail='true']")!.getBoundingClientRect();
        const framework = document.querySelector("[data-framework-surface='true']")!.getBoundingClientRect();
        const sponsor = document.querySelector("[data-sponsorship-section='true']")!.getBoundingClientRect();
        return {
          stageHeight: stage.height,
          stageWidth: stage.width,
          frameworkHeight: framework.height,
          sponsorTop: sponsor.top + window.scrollY,
          labels: [...document.querySelectorAll<HTMLElement>("[data-framework-surface='true'] [role='tab']")].map((label) => {
            const bounds = label.getBoundingClientRect();
            return { top: bounds.top + window.scrollY, left: bounds.left, width: bounds.width, height: bounds.height };
          }),
          visiblePanels: [...document.querySelectorAll<HTMLElement>("[data-framework-panel]")].filter((panel) => getComputedStyle(panel).display !== "none").length,
          splitLines: document.querySelectorAll(".zenith-framework-detail-line").length,
        };
      });
      expect(Math.abs(settledLayout.stageHeight - initialLayout.stageHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(settledLayout.stageWidth - initialLayout.stageWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(settledLayout.frameworkHeight - initialLayout.frameworkHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(settledLayout.sponsorTop - initialLayout.sponsorTop)).toBeLessThanOrEqual(1);
      expect(settledLayout.labels).toEqual(initialLayout.labels);
      expect(settledLayout.visiblePanels).toBe(1);
      expect(settledLayout.splitLines).toBeGreaterThan(0);
      expect(settledLayout.splitLines).toBeLessThan(10);

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
      expect(await page.locator("[data-framework-surface='true']").count()).toBe(1);
      await page.locator("[data-framework-surface='true']").scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_300);
      expect(await page.locator("[data-framework-detail='true']").evaluate((node) => getComputedStyle(node).visibility)).toBe("visible");

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
      expect(await reducedPage.locator("[data-framework-detail='true']").evaluate((node) => getComputedStyle(node).visibility)).toBe("visible");
      await reducedContext.close();
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      server.kill();
    }
  }, 180_000);
});
