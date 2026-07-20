import { describe, expect, test } from "bun:test";

const PORT = 4017;
const origin = `http://localhost:${PORT}`;
const sections = [
  "home-precision",
  "home-framework-surface",
  "home-sponsorship",
  "home-community",
] as const;
const contributorProfiles = [
  { label: "View Judah Sullivan's profile", href: "https://github.com/judahbsullivan" },
  { label: "View Jonathan Streetman's profile", href: "https://github.com/Jstreetman" },
  { label: "View Colin Williams's profile", href: "https://github.com/colinwilliams91" },
] as const;

async function startDevServer(): Promise<{ kill: () => void }> {
  const { spawn } = await import("child_process");
  const http = await import("http");
  const dev = spawn("npx", ["zenith", "dev", "--port", String(PORT)], {
    cwd: import.meta.dir + "/..",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const requestStatus = () => new Promise<number>((resolve) => {
    const request = http.get(origin, (response) => { response.resume(); resolve(response.statusCode || 0); });
    request.on("error", () => resolve(0));
    request.setTimeout(2_000, () => { request.destroy(); resolve(0); });
  });

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (await requestStatus() === 200) return { kill: () => dev.kill() };
  }
  dev.kill();
  throw new Error("Home motion readiness dev server failed to start");
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

async function stageSectionBeforeTrigger(page: import("playwright").Page, name: string) {
  await page.evaluate((sectionName) => {
    const root = document.querySelector<HTMLElement>(`[data-motion-section="${sectionName}"]`)!;
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - window.innerHeight + 130, behavior: "instant" });
  }, name);
  await page.waitForTimeout(150);
}

async function playSection(page: import("playwright").Page, name: string) {
  await page.evaluate((sectionName) => {
    const root = document.querySelector<HTMLElement>(`[data-motion-section="${sectionName}"]`)!;
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - window.innerHeight + 220, behavior: "instant" });
  }, name);
  await page.waitForFunction(
    (sectionName) => document.querySelector(`[data-motion-section="${sectionName}"]`)?.getAttribute("data-motion-state") === "complete",
    name,
    { timeout: 12_000 },
  );
}

describe("Home scroll-motion readiness", () => {
  test("keeps each refined section prepared before its trigger, plays once, and remains singular after return navigation", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    try {
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await waitForHome(page);

      for (const section of sections) {
        await stageSectionBeforeTrigger(page, section);
        const before = await page.evaluate((sectionName) => {
          const root = document.querySelector<HTMLElement>(`[data-motion-section="${sectionName}"]`)!;
          const targets = [...root.querySelectorAll<HTMLElement>("[data-motion-target='true']")];
          const titleCharacters = [...root.querySelectorAll<HTMLElement>(".zenith-home-section-char")];
          const copyLines = [...root.querySelectorAll<HTMLElement>(".zenith-home-section-line")];
          const motionNodes = titleCharacters.length || copyLines.length ? [...titleCharacters, ...copyLines] : targets;
          return {
            state: root.getAttribute("data-motion-state"),
            nodes: motionNodes.map((node) => {
              const style = getComputedStyle(node);
              return { opacity: Number(style.opacity), visibility: style.visibility };
            }),
          };
        }, section);
        expect(before.state).toBe("waiting");
        expect(before.nodes.length).toBeGreaterThan(0);
        expect(before.nodes.every((node) => node.opacity < 0.02 || node.visibility === "hidden")).toBe(true);

        await playSection(page, section);
        const complete = await page.evaluate((sectionName) => {
          const root = document.querySelector<HTMLElement>(`[data-motion-section="${sectionName}"]`)!;
          return {
            state: root.getAttribute("data-motion-state"),
            visible: [...root.querySelectorAll<HTMLElement>("[data-motion-target='true']")].every((node) => {
              const style = getComputedStyle(node);
              return Number(style.opacity) > 0.98 && style.visibility === "visible";
            }),
          };
        }, section);
        expect(complete.state).toBe("complete");
        expect(complete.visible).toBe(true);
      }

      const characterCount = await page.locator(".zenith-home-section-char").count();
      await page.reload({ waitUntil: "networkidle" });
      await waitForHome(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
      await stageSectionBeforeTrigger(page, "home-community");
      expect(await page.locator("[data-motion-section='home-community']").getAttribute("data-motion-state")).toBe("waiting");
      await page.locator("[data-nav-shell='true'] a[href='/blog']").first().click();
      await page.waitForURL(`${origin}/blog`);
      await page.locator("[data-nav-shell='true'] a[href='/']").first().click();
      await page.waitForURL(`${origin}/`);
      await waitForHome(page);
      await waitForTransition(page);
      await page.waitForFunction(() => document.querySelectorAll(".zenith-home-section-char").length > 0, { timeout: 12_000 });
      expect(await page.locator("[data-motion-section='home-precision']").count()).toBe(1);
      expect(await page.locator("[data-motion-section='home-framework-surface']").count()).toBe(1);
      expect(await page.locator(".zenith-home-section-char").count()).toBe(characterCount);
      await page.goBack();
      await page.waitForURL(`${origin}/blog`);
      await page.goForward();
      await page.waitForURL(`${origin}/`);
      await waitForHome(page);
      expect(await page.locator("[data-motion-section='home-community']").count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      server.kill();
    }
  }, 180_000);

  test("renders compact deduplicated contributor avatars with browser-resolving profile links", async () => {
    const { chromium } = await import("playwright");
    const server = await startDevServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    try {
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await waitForHome(page);
      await playSection(page, "home-community");
      const group = page.locator("[data-contributor-avatar-group='true']");
      const avatars = group.getByRole("link");
      expect(await avatars.count()).toBe(contributorProfiles.length);
      expect(await page.getByText("Judah Sullivan", { exact: true }).count()).toBe(0);
      expect(await page.getByText("Repository contributor", { exact: true }).count()).toBe(0);

      const avatarState = await group.evaluate((node) => {
        const groupBounds = node.getBoundingClientRect();
        const avatars = [...node.querySelectorAll<HTMLAnchorElement>("a")];
        return {
          groupWidth: groupBounds.width,
          groupScrollWidth: node.scrollWidth,
          avatars: avatars.map((avatar) => {
            const image = avatar.querySelector<HTMLImageElement>("img");
            const style = getComputedStyle(avatar);
            const bounds = avatar.getBoundingClientRect();
            return {
              href: avatar.href,
              label: avatar.getAttribute("aria-label"),
              width: bounds.width,
              height: bounds.height,
              opacity: Number(style.opacity),
              visible: style.visibility === "visible",
              imageReady: Boolean(image?.complete && ((image.naturalWidth || 0) > 0 || image.classList.contains("hidden"))),
            };
          }),
        };
      });
      expect(avatarState.groupScrollWidth).toBeLessThanOrEqual(avatarState.groupWidth + 1);
      expect(avatarState.avatars.map((avatar) => avatar.href)).toEqual(contributorProfiles.map((profile) => profile.href));
      expect(avatarState.avatars.map((avatar) => avatar.label)).toEqual(contributorProfiles.map((profile) => profile.label));
      expect(avatarState.avatars.every((avatar) => avatar.width >= 40 && avatar.width <= 48 && avatar.height >= 40 && avatar.height <= 48 && avatar.opacity > 0.98 && avatar.visible && avatar.imageReady)).toBe(true);

      for (const profile of contributorProfiles) {
        const link = page.getByRole("link", { name: profile.label });
        const popup = page.waitForEvent("popup");
        await link.click();
        const profilePage = await popup;
        await profilePage.waitForLoadState("domcontentloaded");
        expect(new URL(profilePage.url()).pathname.toLowerCase()).toBe(new URL(profile.href).pathname.toLowerCase());
        await profilePage.close();
      }

      const keyboardLink = page.getByRole("link", { name: contributorProfiles[1].label });
      await keyboardLink.focus();
      const keyboardPopup = page.waitForEvent("popup");
      await keyboardLink.press("Enter");
      const keyboardProfile = await keyboardPopup;
      await keyboardProfile.waitForLoadState("domcontentloaded");
      expect(new URL(keyboardProfile.url()).pathname.toLowerCase()).toBe(new URL(contributorProfiles[1].href).pathname.toLowerCase());
      await keyboardProfile.close();

      await page.setViewportSize({ width: 1440, height: 900 });
      await playSection(page, "home-community");
      expect(await group.evaluate((node) => [...node.querySelectorAll<HTMLElement>("a")].every((avatar) => avatar.getBoundingClientRect().width >= 48 && avatar.getBoundingClientRect().width <= 64))).toBe(true);
    } finally {
      await browser.close();
      server.kill();
    }
  }, 180_000);
});
