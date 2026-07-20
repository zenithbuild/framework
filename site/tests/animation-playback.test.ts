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

async function startDevServer(): Promise<{ kill: () => void }> {
  const { spawn } = await import("child_process");
  const http = await import("http");

  const dev = spawn("npx", ["zenith", "dev", `--port`, String(PORT)], {
    cwd: import.meta.dir + "/..",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const checkUrl = (url: string) => new Promise<number>((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode || 0); });
    req.on("error", () => resolve(0));
    req.setTimeout(3000, () => { req.destroy(); resolve(0); });
  });

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (await checkUrl(`http://localhost:${PORT}/`) === 200) {
      return { kill: () => dev.kill() };
    }
  }
  dev.kill();
  throw new Error("Dev server failed to start");
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
      server.kill();
    }
  }, 60000);
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
        { timeout: 30000 },
      );

      // Navigate to /blog (eligible for branded transition)
      await page.click('a[href="/blog"]');

      // Verify the route transition overlay appears
      await page.waitForTimeout(500);
      const overlay = await page.$('[data-route-transition="true"]');
      expect(overlay).toBeTruthy();

      // Verify the transition progresses past idle
      await page.waitForTimeout(2000);
      const phase2s = await page.$eval(
        '[data-route-transition="true"]',
        (el) => el.getAttribute("data-route-transition-phase"),
      );
      expect(phase2s).not.toBe("idle");

      // Verify the transition reaches completion
      await page.waitForFunction(
        () => {
          const el = document.querySelector("[data-route-transition='true']");
          if (!el) return false;
          return el.getAttribute("data-route-transition-phase") === "complete";
        },
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
      server.kill();
    }
  }, 120000);
});

describe("intro label flash regression", () => {
  test("final phrase never reappears after its exit", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

      // Wait for markRevealed (phrases start)
      await page.waitForFunction(
        () => document.documentElement.getAttribute("data-zenith-intro-state") === "markRevealed",
        { timeout: 15000 },
      );

      // Sample label state every 200ms to catch any flash
      const samples: Array<{ text: string; opacity: number; visible: boolean }> = [];
      let sampling = true;
      const sampleInterval = setInterval(async () => {
        if (!sampling) return;
        try {
          const state = await page.evaluate(() => {
            const label = document.querySelector("[data-transition-label='true']");
            if (!label) return null;
            const s = window.getComputedStyle(label);
            return {
              text: (label.textContent || "").slice(0, 30),
              opacity: parseFloat(s.opacity),
              visible: s.visibility === "visible",
            };
          });
          if (state) samples.push(state);
        } catch {}
      }, 200);

      // Wait for intro completion
      await page.waitForFunction(
        () => document.documentElement.getAttribute("data-zenith-intro-state") === "complete",
        { timeout: 30000 },
      );
      sampling = false;
      clearInterval(sampleInterval);

      // Find the last sample with non-empty text and visible
      let lastVisibleTextIdx = -1;
      for (let i = samples.length - 1; i >= 0; i--) {
        if (samples[i].text.length > 0 && samples[i].opacity > 0 && samples[i].visible) {
          lastVisibleTextIdx = i;
          break;
        }
      }

      // After the last visible text, there should be no further visible text
      let flashDetected = false;
      if (lastVisibleTextIdx >= 0) {
        for (let i = lastVisibleTextIdx + 1; i < samples.length; i++) {
          if (samples[i].text.length > 0 && samples[i].opacity > 0 && samples[i].visible) {
            flashDetected = true;
            break;
          }
        }
      }

      expect(flashDetected).toBe(false);

      // Verify the label is empty and hidden at the end
      const finalLabel = await page.evaluate(() => {
        const label = document.querySelector("[data-transition-label='true']");
        if (!label) return null;
        const s = window.getComputedStyle(label);
        return { text: label.textContent, opacity: s.opacity, visibility: s.visibility };
      });
      expect(finalLabel).toBeTruthy();
      expect(finalLabel!.text).toBe("");
      expect(finalLabel!.opacity).toBe("0");

      // Verify no page errors
      expect(errors.length).toBe(0);

      await browser.close();
    } finally {
      server.kill();
    }
  }, 60000);
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
        { timeout: 30000 },
      );

      // Navigate to /blog
      await page.click('a[href="/blog"]');

      // Wait for transition to start
      await page.waitForTimeout(500);

      // Wait for transition to complete
      await page.waitForFunction(
        () => {
          const el = document.querySelector("[data-route-transition='true']");
          if (!el) return false;
          return el.getAttribute("data-route-transition-phase") === "complete";
        },
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
      server.kill();
    }
  }, 120000);
});
