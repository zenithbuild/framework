import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startSiteDevServer } from "./helpers/dev-server";

const port = 4014;
const origin = `http://127.0.0.1:${port}`;
let server: Awaited<ReturnType<typeof startSiteDevServer>> | null = null;

async function waitForTransition(page: import("playwright").Page) {
  await page.waitForFunction(
    () => document.querySelector("[data-route-transition='true']")?.getAttribute("data-route-transition-phase") === "complete",
    undefined,
    { timeout: 30_000 },
  );
}

// v1 home: the pipeline tablist (desktop viewport) is the stateful Home control under test.
async function activateStageTab(page: import("playwright").Page, stage: string) {
  const tab = page.locator(`[data-pipeline-root='true'] [data-stage-tab='${stage}']`);
  await tab.click();
  await page.waitForFunction(
    (key) => document.querySelector("[data-pipeline-root='true']")?.getAttribute("data-active-stage") === key,
    stage,
  );
  expect(await tab.getAttribute("aria-selected")).toBe("true");
}

beforeAll(async () => {
  // Resolve browser prerequisites before starting a process that needs cleanup.
  await import("playwright");
  server = await startSiteDevServer(port);
}, 610_000);

afterAll(async () => {
  await server?.stop();
});

describe("route-transition lifecycle", () => {
  test("keeps Home controls live through SPA returns, Back, and repeated visits", async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    try {
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
        undefined,
        { timeout: 30_000 },
      );
      await activateStageTab(page, "compile");
      expect(await page.locator("#pipeline-panel-compile").textContent()).toContain("bundler_contracts.rs:50-104");

      for (let visit = 0; visit < 2; visit += 1) {
        await page.locator("[data-nav-shell='true'] a[href='/blog']").first().click();
        await page.waitForURL(`${origin}/blog`);
        await waitForTransition(page);
        await page.locator("[data-nav-shell='true'] a[href='/']").first().click();
        await page.waitForURL(`${origin}/`);
        await waitForTransition(page);

        await page.waitForFunction(() => getComputedStyle(document.querySelector("main")!).pointerEvents === "auto");
        expect(await page.locator("[data-v1-hero='true']").count()).toBe(1);
        expect(await page.locator("[data-pipeline-root='true'] [role='tablist'][aria-label='Pipeline stages']").count()).toBe(1);
        await activateStageTab(page, "bundle");
        expect(await page.locator("#pipeline-panel-bundle").textContent()).toContain("manifest.json");
      }

      await page.locator("[data-nav-shell='true'] a[href='/blog']").first().click();
      await page.waitForURL(`${origin}/blog`);
      await waitForTransition(page);
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForURL(`${origin}/`);
      await waitForTransition(page);

      // The previous transition's "complete" phase can still be showing when Back starts, so wait for
      // the Home hero itself to be mounted and laid out before pressing it.
      // Back can start its transition ~2s later, and the shell is inert while it enters.
      await page.waitForFunction(() => document.querySelector("[data-hero-panel='true']")?.getAttribute("data-hero-connectors") === "ready"
        && document.querySelector("[data-route-transition='true']")?.getAttribute("data-route-transition-phase") === "complete"
        && getComputedStyle(document.querySelector("main")!).pointerEvents === "auto", undefined, { timeout: 30_000 });
      const trigger = page.locator("[data-hero-trigger='true']");
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector("[data-hero-panel='true']")?.getAttribute("data-hero-state") === "failed");
      expect(await trigger.getAttribute("aria-disabled")).toBe("true");

      const themeToggle = page.getByRole("button", { name: /theme/i });
      const themeBefore = await themeToggle.getAttribute("aria-label");
      await themeToggle.click();
      await page.waitForFunction((previousLabel) => document.querySelector("[data-zen-theme-toggle='true']")?.getAttribute("aria-label") !== previousLabel, themeBefore);
      expect(await themeToggle.getAttribute("aria-label")).not.toBe(themeBefore);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 120_000);
});
