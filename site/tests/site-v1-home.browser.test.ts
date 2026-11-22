import { startSiteDevServer } from "./helpers/dev-server";
import { describe, expect, test } from "bun:test";

// v1 Home interactions (handoff site-build-handoff.md §5, JUD-138..149). Replaces the retired
// home-section-refinement / home-motion-readiness browser tests that exercised the old Home sections.
const PORT = 4016;
const origin = `http://localhost:${PORT}`;
type Page = import("playwright").Page;

const isFocused = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => element === document.activeElement);
const heroState = (page: Page) =>
  page.locator("[data-hero-panel='true']").getAttribute("data-hero-state");

describe("v1 Home interactions", () => {
  test("hero, pipeline, copy, and terminal controls follow the handoff keyboard and ARIA contract", async () => {
    const { chromium } = await import("playwright");
    const server = await startSiteDevServer(PORT);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    try {
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.querySelector("[data-hero-panel='true']")?.getAttribute("data-hero-connectors") === "ready");
      await page.waitForFunction(() => document.documentElement.dataset.zenithIntroState === "complete");
      expect(await heroState(page)).toBe("compiled");
      expect(await page.locator("[data-hero-live='true']").textContent()).toBe("");

      // Trigger -> failed: aria-disabled (never disabled), focus stays, live region set once.
      const trigger = page.locator("[data-hero-trigger='true']");
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector("[data-hero-panel='true']")?.getAttribute("data-hero-state") === "failed");
      expect(await trigger.getAttribute("aria-disabled")).toBe("true");
      expect(await trigger.getAttribute("disabled")).toBe(null);
      expect(await isFocused(page, "[data-hero-trigger='true']")).toBe(true);
      const announcement = await page.locator("[data-hero-live='true']").textContent();
      expect(announcement).toContain("ZEN-EVT-STRING-HANDLER");
      await page.keyboard.press("Enter");
      expect(await page.locator("[data-hero-live='true']").textContent()).toBe(announcement);
      expect(await heroState(page)).toBe("failed");

      // Reset -> compiled, live region cleared, focus returns to the trigger.
      await page.locator("[data-hero-reset='true']").click();
      await page.waitForFunction(() => document.querySelector("[data-hero-panel='true']")?.getAttribute("data-hero-state") === "compiled");
      expect(await page.locator("[data-hero-live='true']").textContent()).toBe("");
      expect(await isFocused(page, "[data-hero-trigger='true']")).toBe(true);
      expect(await page.locator("[data-hero-reset='true']").getAttribute("aria-disabled")).toBe("true");

      // Pipeline vertical tablist: arrows, Home/End, roving tabindex.
      const buildTab = page.locator("[data-stage-tab='build']");
      await buildTab.focus();
      await page.keyboard.press("ArrowDown");
      expect(await page.locator("[data-pipeline-root='true']").getAttribute("data-active-stage")).toBe("compile");
      expect(await isFocused(page, "[data-stage-tab='compile']")).toBe(true);
      await page.keyboard.press("End");
      expect(await page.locator("[data-stage-tab='run']").getAttribute("aria-selected")).toBe("true");
      expect(await page.locator("[data-stage-tab='run']").getAttribute("tabindex")).toBe("0");
      expect(await buildTab.getAttribute("tabindex")).toBe("-1");
      await page.keyboard.press("Home");
      expect(await page.locator("[data-pipeline-root='true']").getAttribute("data-active-stage")).toBe("build");
      expect(await page.locator("#pipeline-panel-build").isVisible()).toBe(true);

      // The Round 2 steps keep the recorded terminal output available on demand.
      await page.getByText("View terminal output", { exact: true }).click();
      const toggle = page.locator("[data-log-toggle='true']");
      expect(await toggle.getAttribute("aria-expanded")).toBe("false");
      expect(await page.locator("[data-log-extra='true']").first().isVisible()).toBe(false);
      await toggle.click();
      expect(await toggle.getAttribute("aria-expanded")).toBe("true");
      expect(await toggle.textContent()).toContain("Hide full log");
      expect(await page.locator("[data-log-extra='true']").first().isVisible()).toBe(true);
      await toggle.click();
      expect(await toggle.getAttribute("aria-expanded")).toBe("false");

      // Copy: clipboard gets the exact command; one shared polite region announces it.
      await page.locator("[data-copy-command='install'] [data-copy-trigger='true']").first().click();
      await page.waitForFunction(() => document.querySelector("[data-copy-live='true']")?.textContent === "Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("bun create zenith@latest");
      expect(await page.locator("[aria-live='polite'][data-copy-live='true']").count()).toBe(1);

      // Below 768: the pipeline is an accordion with aria-expanded headers.
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.locator("[data-stage-tab='build']").isVisible()).toBe(false);
      const compileHeader = page.locator("[data-stage-toggle='compile']");
      expect(await compileHeader.getAttribute("aria-expanded")).toBe("true");
      await page.locator("[data-stage-toggle='bundle']").click();
      expect(await page.locator("[data-stage-toggle='bundle']").getAttribute("aria-expanded")).toBe("true");
      expect(await compileHeader.getAttribute("aria-expanded")).toBe("false");
      expect(await isFocused(page, "[data-stage-toggle='bundle']")).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.stop();
    }
  }, 660_000);
});
