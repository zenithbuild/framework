import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { get } from "node:http";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");
const port = 4014;
const origin = `http://127.0.0.1:${port}`;
let server: ChildProcess | null = null;

function requestStatus(url: string) {
  return new Promise<number>((resolveStatus) => {
    const request = get(url, (response) => {
      response.resume();
      resolveStatus(response.statusCode || 0);
    });
    request.on("error", () => resolveStatus(0));
    request.setTimeout(1_000, () => {
      request.destroy();
      resolveStatus(0);
    });
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await requestStatus(`${origin}/`) === 200) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("Zenith dev server did not become ready");
}

async function waitForTransition(page: import("playwright").Page) {
  await page.waitForFunction(
    () => document.querySelector("[data-route-transition='true']")?.getAttribute("data-route-transition-phase") === "complete",
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
  server = spawn("npx", ["zenith", "dev", "--port", String(port)], {
    cwd: siteRoot,
    stdio: "ignore",
  });
  await waitForServer();
}, 90_000);

afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await once(server, "exit");
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
        { timeout: 30_000 },
      );
      await activateHeroTab(page, "State");
      await page.waitForFunction(() => document.querySelector("#hero-code-panel code")?.textContent?.includes("state panel"));
      expect(await page.locator("#hero-code-panel code").textContent()).toContain("state panel");

      for (let visit = 0; visit < 2; visit += 1) {
        await page.locator("[data-nav-shell='true'] a[href='/blog']").first().click();
        await page.waitForURL(`${origin}/blog`);
        await waitForTransition(page);
        await page.locator("[data-nav-shell='true'] a[href='/']").nth(1).click();
        await page.waitForURL(`${origin}/`);
        await waitForTransition(page);

        await page.waitForFunction(() => getComputedStyle(document.querySelector("main")!).pointerEvents === "auto");
        expect(await page.locator("[data-home-hero='true']").count()).toBe(1);
        expect(await page.locator("[data-home-hero='true'] [role='tablist']").count()).toBe(1);
        await activateHeroTab(page, "Server");
        await page.waitForFunction(() => document.querySelector("#hero-code-panel code")?.textContent?.includes("requireSession"));
        expect(await page.locator("#hero-code-panel code").textContent()).toContain("requireSession");
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
      await page.waitForFunction(() => document.querySelector("#hero-code-panel code")?.textContent?.includes("on:hoverin"));
      expect(await eventsTab.getAttribute("aria-selected")).toBe("true");
      expect(await page.locator("#hero-code-panel code").textContent()).toContain("on:hoverin");

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
