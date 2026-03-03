import { expect, test } from "@playwright/test";

function readMotion(locator) {
  return locator.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      opacity: styles.opacity,
      transform: styles.transform
    };
  });
}

test("serves compiled dev css and exercises nav motion without literal tailwindcss requests", async ({ page, request }) => {
  const urls = [];
  page.on("request", (entry) => {
    urls.push(entry.url());
  });

  const stateResponse = await request.get("/__zenith_dev/state");
  expect(stateResponse.ok()).toBeTruthy();
  const state = await stateResponse.json();
  expect(String(state.cssHref || "")).toContain("/__zenith_dev/styles.css?buildId=");

  const cssResponse = await request.get("/__zenith_dev/styles.css");
  expect(cssResponse.ok()).toBeTruthy();
  const css = await cssResponse.text();
  expect(css).not.toContain('@import "tailwindcss"');
  expect(css.length).toBeGreaterThan(100);

  await page.goto("/");
  await expect(page.locator("[data-smoke-title]")).toContainText("Zenith Smoke App");
  await page.waitForLoadState("networkidle");

  const toggle = page.locator("[data-smoke-nav-toggle]");
  const panel = page.locator("[data-smoke-nav-panel]");
  const status = page.locator("[data-smoke-status]");
  const motionCard = page.locator("[data-smoke-anim-card]");

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveAttribute("data-state", "closed");
  await expect(status).toContainText("closed");

  const before = await readMotion(motionCard);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveAttribute("data-state", "open");
  await expect(status).toContainText("open");
  await page.waitForTimeout(300);

  const after = await readMotion(motionCard);

  expect(after.transform).not.toBe(before.transform);
  expect(urls.some((url) => url.includes("tailwindcss"))).toBeFalsy();
});
