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

async function activateHeroTab(page: import("playwright").Page, name: string) {
  const tab = page.getByRole("tab", { name, exact: true }).first();
  await tab.click();
  await page.waitForFunction(
    (tabName) => [...document.querySelectorAll("[data-home-hero='true'] [role='tab']")]
      .some((candidate) => candidate.textContent?.trim() === tabName && candidate.getAttribute("aria-selected") === "true"),
    name,
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
      await activateHeroTab(page, "State");
      await page.waitForFunction(() => document.querySelector("#workbench-panel code")?.textContent?.includes("state open = false"));
      expect(await page.locator("#workbench-panel code").textContent()).toContain("state open = false");

      for (let visit = 0; visit < 2; visit += 1) {
        await page.locator("[data-nav-shell='true'] a[href='/blog']").first().click();
        await page.waitForURL(`${origin}/blog`);
        await waitForTransition(page);
        await page.locator("[data-nav-shell='true'] a[href='/']").nth(1).click();
        await page.waitForURL(`${origin}/`);
        await waitForTransition(page);

        await page.waitForFunction(() => getComputedStyle(document.querySelector("main")!).pointerEvents === "auto");
        expect(await page.locator("[data-home-hero='true']").count()).toBe(1);
        expect(await page.locator("[data-home-hero='true'] [role='tablist'][aria-label='Zenith examples']").count()).toBe(1);
        await activateHeroTab(page, "Server");
        await page.waitForFunction(() => document.querySelector("#workbench-panel code")?.textContent?.includes("export const guard"));
        expect(await page.locator("#workbench-panel code").textContent()).toContain("export const guard");
      }

      await page.locator("[data-nav-shell='true'] a[href='/blog']").first().click();
      await page.waitForURL(`${origin}/blog`);
      await waitForTransition(page);
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForURL(`${origin}/`);
      await waitForTransition(page);

      const eventsTab = page.getByRole("tab", { name: "Events", exact: true }).first();
      await eventsTab.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => [...document.querySelectorAll("[data-home-hero='true'] [role='tab']")]
        .some((candidate) => candidate.textContent?.trim() === "Events" && candidate.getAttribute("aria-selected") === "true"));
      await page.waitForFunction(() => document.querySelector("#workbench-panel code")?.textContent?.includes("on:hoverin"));
      expect(await eventsTab.getAttribute("aria-selected")).toBe("true");
      expect(await page.locator("#workbench-panel code").textContent()).toContain("on:hoverin");

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
