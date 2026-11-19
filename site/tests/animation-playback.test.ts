import { startSiteDevServer } from "./helpers/dev-server";
import { describe, expect, test } from "bun:test";

/**
 * Browser-level playback tests using Playwright.
 *
 * These tests verify that GSAP timelines actually create, play, and
 * progress through phases in a real browser — not just that source
 * code contains expected strings.
 *
 * They start a Zenith dev server, open it in Chromium, and observe
 * the intro and route transition animations from start to finish.
 */

const PORT = 4010;

async function startDevServer() {
  return startSiteDevServer(PORT);
}

describe("intro animation playback", () => {
  test("intro timeline plays through all phases to completion", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);

      // Verify composition elements exist in the DOM
      const composition = await page.$('[data-intro-composition="true"]');
      expect(composition).toBeTruthy();

      const artwork = await page.$('[data-transition-artwork="true"]');
      expect(artwork).toBeTruthy();

      const rings = await page.$$('[data-transition-ring]');
      expect(rings.length).toBeGreaterThanOrEqual(3);

      const markRing = await page.$('[data-transition-mark-ring="true"]');
      expect(markRing).toBeTruthy();

      const label = await page.$('[data-transition-label="true"]');
      expect(label).toBeTruthy();

      // Verify the phase progresses past the initial state
      await page.waitForTimeout(2000);
      const phase2s = await page.getAttribute("html", "data-zenith-intro-state");
      expect(phase2s).not.toBe("pending");
      expect(phase2s).not.toBe(null);

      // Verify the intro reaches completion
      await page.waitForFunction(
        () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
        undefined,
        { timeout: 30000 },
      );

      // Verify the page content becomes visible after intro
      const pageVisible = await page.evaluate(() => {
        const m = document.querySelector("main");
        if (!m) return false;
        return window.getComputedStyle(m).visibility === "visible";
      });
      expect(pageVisible).toBe(true);

      // Verify no page errors occurred
      expect(errors.length).toBe(0);

      await browser.close();
    } finally {
      await server.stop();
    }
  }, 660_000);
});

describe("route transition playback", () => {
  test("eligible route transition plays and completes", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      // Load home and wait for intro to complete
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
        undefined,
        { timeout: 30000 },
      );

      // Navigate to /blog (eligible for branded transition)
      await page.click('a[href="/blog"]');

      // Verify the route transition overlay appears
      await page.waitForTimeout(500);
      const overlay = await page.$('[data-route-transition="true"]');
      expect(overlay).toBeTruthy();

      // Verify the transition progresses past idle. The router fires
      // navigation:before-leave only after route-check and the destination HTML
      // fetch resolve (fetch-before-commit, router-contract.md), which takes ~3s
      // on a cold dev server, so wait for the phase instead of sampling at 2.5s.
      await page.waitForFunction(
        () => {
          const phase = document.querySelector("[data-route-transition='true']")?.getAttribute("data-route-transition-phase");
          return Boolean(phase) && phase !== "idle";
        },
        undefined,
        { timeout: 20000 },
      );

      // Verify the transition reaches completion
      await page.waitForFunction(
        () => {
          const el = document.querySelector("[data-route-transition='true']");
          if (!el) return false;
          return el.getAttribute("data-route-transition-phase") === "complete";
        },
        undefined,
        { timeout: 30000 },
      );

      // Verify the destination URL changed
      expect(page.url()).toContain("/blog");

      // Verify the page content is visible
      const pageVisible = await page.evaluate(() => {
        const m = document.querySelector("main");
        if (!m) return false;
        return window.getComputedStyle(m).visibility === "visible";
      });
      expect(pageVisible).toBe(true);

      // Verify no page errors
      expect(errors.length).toBe(0);

      await browser.close();
    } finally {
      await server.stop();
    }
  }, 660_000);
});

describe("v1 home without a preloader", () => {
  // Build gate 3 (handoff §6): no preloader on Home. The intro label phases never run, so the old
  // label-flash regression cannot occur; this asserts the replacement contract instead.
  test("never enters the branded intro phases and shows the hero H1 immediately", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.addInitScript(() => {
        const seen: string[] = [];
        (window as unknown as { __introStates: string[] }).__introStates = seen;
        // Init scripts run before <html> exists, so observe the document subtree.
        new MutationObserver(() => {
          const value = document.documentElement?.getAttribute("data-zenith-intro-state");
          if (value && seen[seen.length - 1] !== value) seen.push(value);
        }).observe(document, { attributes: true, subtree: true, childList: true, attributeFilter: ["data-zenith-intro-state"] });
      });
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
        undefined,
        { timeout: 30000 },
      );
      const states = await page.evaluate(() => (window as unknown as { __introStates: string[] }).__introStates);
      expect(states.includes("markRevealed")).toBe(false);
      expect(states.includes("movingLogo")).toBe(false);
      const heading = page.locator("[data-hero-h1='true']");
      expect(await heading.isVisible()).toBe(true);
      expect(await heading.getAttribute("data-route-title")).toBe(null);
      expect(errors).toEqual([]);
      await browser.close();
    } finally {
      await server.stop();
    }
  }, 660_000);
});

describe("destination entrance replay", () => {
  test("eligible route transition replays destination entrance animation", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      // Load home and wait for intro
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
        undefined,
        { timeout: 30000 },
      );

      // Navigate to /about: its PageHeader tags [data-route-entrance] targets.
      // /blog uses scroll-mode motion and exposes no entrance targets by design.
      // v1: /about is linked from Why Zenith ("Read the full argument"), not from the nav.
      await page.click('[data-v1-why="true"] a[href="/about"]');

      // Wait for transition to start
      await page.waitForTimeout(500);

      // Wait for transition to complete
      await page.waitForFunction(
        () => {
          const el = document.querySelector("[data-route-transition='true']");
          if (!el) return false;
          return el.getAttribute("data-route-transition-phase") === "complete";
        },
        undefined,
        { timeout: 30000 },
      );

      // Verify entrance targets exist and are visible
      const entranceState = await page.evaluate(() => {
        const targets = document.querySelectorAll("[data-route-entrance]");
        if (!targets.length) return { count: 0, allVisible: false };
        const results = Array.from(targets).map((t) => {
          const s = window.getComputedStyle(t);
          return { opacity: parseFloat(s.opacity), visibility: s.visibility };
        });
        return {
          count: targets.length,
          allVisible: results.every((r) => r.opacity >= 0.9 && r.visibility === "visible"),
        };
      });

      expect(entranceState.count).toBeGreaterThan(0);
      expect(entranceState.allVisible).toBe(true);

      // Verify page is interactive
      const interactive = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return false;
        return !main.hasAttribute("inert") && window.getComputedStyle(main).visibility === "visible";
      });
      expect(interactive).toBe(true);

      // Verify no errors
      expect(errors.length).toBe(0);

      await browser.close();
    } finally {
      await server.stop();
    }
  }, 660_000);
});
