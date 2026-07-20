import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = 4026;
const origin = `http://127.0.0.1:${PORT}`;

async function startDevServer(): Promise<{ kill: () => void }> {
  const dev = spawn("npx", ["zenith", "dev", "--port", String(PORT)], {
    cwd: import.meta.dir + "/..",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ZENITH_DOCUMENTATION_SOURCE: "local", ZENITH_SITE_ORIGIN: "https://zenithbuild.dev" },
  });
  const status = () => new Promise<number>((resolve) => {
    const request = http.get(origin, (response) => { response.resume(); resolve(response.statusCode || 0); });
    request.on("error", () => resolve(0));
    request.setTimeout(2_000, () => { request.destroy(); resolve(0); });
  });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await status() === 200) return { kill: () => dev.kill() };
  }
  dev.kill();
  throw new Error("Documentation dev server failed to start");
}

describe("documentation reader path", () => {
  test("renders the ordered index and navigates every public section without regressions", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${page.url()} :: ${message.text()}`); });

    try {
      const indexResponse = await page.goto(`${origin}/docs`, { waitUntil: "load" });
      expect(indexResponse?.status()).toBe(200);
      await page.waitForFunction(() => document.querySelectorAll("[data-docs-section-card]").length === 8);
      expect(await page.locator("[data-docs-section-card] h4").allTextContents()).toEqual([
        "Getting Started",
        "Core Concepts",
        "Pages and Routing",
        "Server and Data",
        "Styling and UI",
        "Build and Tooling",
        "Deployment",
        "Advanced",
      ]);
      expect(await page.locator('a[href="/docs/getting-started"]').count()).toBeGreaterThan(0);
      expect(await page.getByText("Docs Inventory", { exact: true }).count()).toBe(0);

      const readerPath = [
        "/docs/getting-started",
        "/docs/install-compatibility",
        "/docs/getting-started/project-structure",
        "/docs/getting-started/first-page",
        "/docs/getting-started/development-workflow",
        "/docs/getting-started/build-and-preview",
        "/docs/zenith-contract",
      ];
      await page.goto(`${origin}${readerPath[0]}`, { waitUntil: "load" });
      await page.waitForTimeout(1_800);
      await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>("[data-docs-shell]");
        const references = window as Window & {
          __docsShellReference?: HTMLElement | null;
          __docsSidebarReference?: HTMLElement | null;
          __docsTocReference?: HTMLElement | null;
        };
        references.__docsShellReference = shell;
        references.__docsSidebarReference = document.querySelector<HTMLElement>("[data-docs-sidebar]");
        references.__docsTocReference = document.querySelector<HTMLElement>("[data-docs-on-this-page]");
      });
      for (let index = 1; index < readerPath.length; index += 1) {
        const target = readerPath[index];
        await page.locator(`nav[aria-label="Documentation pagination"] a[href="${target}"]`).click();
        await page.waitForURL(`${origin}${target}`);
        await page.waitForFunction((path) => document.querySelector("[data-docs-sidebar] a[aria-current='page']")?.getAttribute("href") === path, target);
        await page.waitForFunction(() => document.querySelector("[data-docs-article-region]")?.getAttribute("data-docs-transition-phase") === "idle");
        expect(await page.locator("html[data-zenith-transition-active]").count()).toBe(0);
        expect(await page.locator("[data-docs-sidebar] a[aria-current='page']").getAttribute("href")).toBe(target);
        expect(await page.evaluate(() => {
          const references = window as Window & {
            __docsShellReference?: HTMLElement | null;
            __docsSidebarReference?: HTMLElement | null;
            __docsTocReference?: HTMLElement | null;
          };
          return references.__docsShellReference === document.querySelector("[data-docs-shell]")
            && references.__docsSidebarReference === document.querySelector("[data-docs-sidebar]")
            && references.__docsTocReference === document.querySelector("[data-docs-on-this-page]");
        })).toBe(true);
        expect(await page.locator("[data-docs-article-region]").getAttribute("data-docs-transition-phase")).toBe("idle");
      }
      expect(await page.evaluate(() => (window as Window & { __zenithDocsTransitionCount?: number }).__zenithDocsTransitionCount || 0)).toBe(readerPath.length - 1);
      expect(errors).toEqual([]);
      const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(new URL(canonicalHref || origin).pathname).toBe("/docs/zenith-contract");

      await page.reload({ waitUntil: "load" });
      expect(page.url()).toBe(`${origin}/docs/zenith-contract`);
      await page.goBack();
      await page.waitForURL(`${origin}/docs/getting-started/build-and-preview`);
      expect(page.url()).toBe(`${origin}/docs/getting-started/build-and-preview`);

      const sectionRoutes = [
        "/docs/routing/pages-layouts-and-dynamic-routes",
        "/docs/reference/script-server",
        "/docs/guides/styling-and-public-assets",
        "/docs/cli-contract",
        "/docs/guides/deployment-targets",
        "/docs/reactivity/controlled-uncontrolled-components",
      ];
      for (const route of sectionRoutes) {
        const response = await page.goto(`${origin}${route}`, { waitUntil: "load" });
        expect(response?.status()).toBe(200);
        expect(await page.locator("nav[aria-label='Breadcrumb']").count()).toBe(1);
        expect(await page.locator("[data-docs-sidebar] a[aria-current='page']").getAttribute("href")).toBe(route);
      }
      expect(errors).toEqual([]);

      const docsHeadings = page.locator("[data-docs-article='true'] h2, [data-docs-article='true'] h3");
      const docsTocLinks = page.locator("[data-reader-toc='docs'] [data-reader-heading-link]");
      expect(await docsTocLinks.count()).toBe(await docsHeadings.count());
      const docsHeadingIds = await docsHeadings.evaluateAll((elements) => elements.map((element) => element.id));
      if (docsHeadingIds.length > 1) {
        await docsTocLinks.last().click();
        await page.waitForFunction((id) => document.querySelector(`[data-reader-heading-link='${id}']`)?.getAttribute("aria-current") === "location", docsHeadingIds.at(-1));
        await docsTocLinks.first().click();
        await page.waitForFunction((id) => document.querySelector(`[data-reader-heading-link='${id}']`)?.getAttribute("aria-current") === "location", docsHeadingIds[0]);
        const route = sectionRoutes.at(-1) || "";
        const directId = docsHeadingIds[1];
        await page.goto(`${origin}${route}#${directId}`, { waitUntil: "load" });
        await page.waitForFunction((id) => document.querySelector(`[data-reader-heading-link='${id}']`)?.getAttribute("aria-current") === "location", directId);
      }

      await page.evaluate(async () => {
        document.querySelector<HTMLElement>('a[href="/docs/install-compatibility"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 40));
        document.querySelector<HTMLElement>('a[href="/docs/getting-started/project-structure"]')?.click();
      });
      await page.waitForURL(`${origin}/docs/getting-started/project-structure`);
      await page.waitForFunction(() => document.querySelector("[data-docs-sidebar] a[aria-current='page']")?.getAttribute("href") === "/docs/getting-started/project-structure");
      expect(await page.locator("[data-docs-article-header] h1").textContent()).toContain("Project Structure");
      expect(errors).toEqual([]);

      for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 1600, height: 1000 }]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }

      await page.setViewportSize({ width: 1600, height: 1000 });
      const desktopLayout = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
        const sidebar = rect("[data-docs-sidebar]");
        const article = rect("[data-docs-article]");
        const rail = rect("[data-docs-on-this-page]");
        const layout = rect("[data-docs-layout]");
        const blocks = [...document.querySelectorAll("[data-docs-article] pre, [data-docs-article] table")]
          .map((element) => element.getBoundingClientRect());
        return {
          layoutWidth: layout?.width || 0,
          sidebarWidth: sidebar?.width || 0,
          articleWidth: article?.width || 0,
          railWidth: rail?.width || 0,
          separated: Boolean(sidebar && article && rail && sidebar.right <= article.left && article.right <= rail.left),
          richContentContained: blocks.every((block) => article && block.left >= article.left - 1 && block.right <= article.right + 1),
          titleSize: Number.parseFloat(getComputedStyle(document.querySelector("[data-docs-article-header] h1")!).fontSize),
          bodySize: Number.parseFloat(getComputedStyle(document.querySelector(".docs-richtext")!).fontSize),
        };
      });
      expect(desktopLayout.layoutWidth).toBeLessThanOrEqual(1280);
      expect(desktopLayout.sidebarWidth).toBeGreaterThan(180);
      expect(desktopLayout.sidebarWidth).toBeLessThan(300);
      expect(desktopLayout.articleWidth).toBeGreaterThan(480);
      expect(desktopLayout.articleWidth).toBeLessThan(720);
      expect(desktopLayout.railWidth).toBeLessThan(220);
      expect(desktopLayout.separated).toBe(true);
      expect(desktopLayout.richContentContained).toBe(true);
      expect(desktopLayout.titleSize).toBeGreaterThanOrEqual(48);
      expect(desktopLayout.bodySize).toBeGreaterThanOrEqual(16);

      const lightScreenshot = await page.screenshot();
      expect(lightScreenshot.byteLength).toBeGreaterThan(5_000);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      const darkScreenshot = await page.screenshot();
      expect(darkScreenshot.byteLength).toBeGreaterThan(5_000);
      await page.evaluate(() => document.documentElement.classList.remove("dark"));

      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.locator("[data-docs-sidebar]").isVisible()).toBe(false);
      expect(await page.locator("[data-reader-toc='docs']").isVisible()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");

      expect(errors).toEqual([]);
      errors.length = 0;
      const missing = await page.goto(`${origin}/docs/not-a-real-article`, { waitUntil: "load" });
      expect(missing?.status()).toBe(404);
      expect((await page.textContent("body"))?.trim().length).toBeGreaterThan(0);
      expect(errors.every((message) => message.includes("404"))).toBe(true);
    } finally {
      await browser.close();
      server.kill();
    }
  }, 180_000);
});
