import { startSiteDevServer } from "./helpers/dev-server";
import { describe, expect, test } from "bun:test";

// v1 readiness at the handoff widths (§3): no horizontal overflow, 44px tap targets below 768,
// the H1 as the LCP element, no layout shift, and reduced motion leaves the static states usable.
const PORT = 4017;
const origin = `http://localhost:${PORT}`;
const widths = [390, 768, 1024, 1440];

describe("v1 readiness", () => {
  test("holds layout, tap targets, and LCP/CLS at every handoff width", async () => {
    const { chromium } = await import("playwright");
    const server = await startSiteDevServer(PORT);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.addInitScript(() => {
          const metrics = { cls: 0, lcp: "" };
          (window as unknown as { __v1Metrics: typeof metrics }).__v1Metrics = metrics;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
              if (!entry.hadRecentInput) metrics.cls += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((list) => {
            const last = list.getEntries().at(-1) as (PerformanceEntry & { element?: Element }) | undefined;
            const element = last?.element;
            metrics.lcp = element?.closest("[data-hero-h1='true']") ? "hero-h1" : element?.tagName || "";
          }).observe({ type: "largest-contentful-paint", buffered: true });
        });
        for (const path of ["/", "/performance", "/how-it-works/compiler"]) {
          await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect({ width, path, overflow: overflow <= 1 }).toEqual({ width, path, overflow: true });
        }

        await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        const metrics = await page.evaluate(() => (window as unknown as { __v1Metrics: { cls: number; lcp: string } }).__v1Metrics);
        expect(metrics.cls).toBeLessThan(0.1);
        expect(metrics.lcp).toBe("hero-h1");

        if (width < 768) {
          const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
            "[data-v1-home='true'] button, [data-v1-home='true'] a, [data-nav-shell='true'] button",
          )].filter((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible")
            .filter((node) => {
              // Effective hit area includes an absolutely positioned ::after that extends the box.
              const after = getComputedStyle(node, "::after");
              const extends_ = after.content !== "none" && after.position === "absolute";
              const grow = (value: string) => (extends_ ? Math.max(0, -parseFloat(value) || 0) : 0);
              return node.getBoundingClientRect().height + grow(after.top) + grow(after.bottom) < 44;
            })
            .map((node) => (node.textContent || node.getAttribute("aria-label") || "").trim().slice(0, 40)));
          expect(small).toEqual([]);
        }
        await page.close();
      }

      const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await reduced.goto(`${origin}/`, { waitUntil: "networkidle" });
      await reduced.locator("[data-hero-trigger='true']").click();
      await reduced.waitForFunction(() => document.querySelector("[data-hero-panel='true']")?.getAttribute("data-hero-state") === "failed");
      expect(await reduced.locator("[data-hero-legend-error='true']").isVisible()).toBe(true);
      expect(await reduced.locator("[data-hero-h1='true']").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
      await reduced.close();
    } finally {
      await browser.close();
      await server.stop();
    }
  }, 660_000);
});
