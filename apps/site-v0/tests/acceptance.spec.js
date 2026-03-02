/**
 * Zenith Site Acceptance Script
 *
 * Validates the local 0.6.0 site shell integration:
 * 1. Header toggle, hero CTAs, and footer are visible
 * 2. No runtime or router fatals
 * 3. Menu toggle remains clickable and reactive
 * 4. No raw /src asset requests leak into runtime
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.ZENITH_BASE_URL || "http://localhost:3000";

test.describe("Site Acceptance — Home Shell", () => {
    let consoleErrors = [];
    let pageErrors = [];
    let failedResponses = [];
    let srcAssetRequests = [];

    test.beforeEach(async ({ page }) => {
        consoleErrors = [];
        pageErrors = [];
        failedResponses = [];
        srcAssetRequests = [];

        page.on("console", (msg) => {
            if (msg.type() === "error") {
                consoleErrors.push(msg.text());
            }
        });

        page.on("pageerror", (err) => {
            pageErrors.push(err.message);
        });

        page.on("response", (resp) => {
            if (resp.status() >= 400) {
                failedResponses.push(`${resp.status()} ${resp.url()}`);
            }
        });

        page.on("request", (req) => {
            const url = req.url();
            if (url.includes("/src/")) {
                srcAssetRequests.push(url);
            }
        });
    });

    function navToggle(page) {
        return page.locator('[data-zen-btn]').first();
    }

    test("home shell renders visible header, hero actions, and footer", async ({ page }) => {
        await page.goto(BASE, { waitUntil: "networkidle" });
        await expect(navToggle(page)).toBeVisible();
        await expect(page.getByRole('link', { name: 'Initialize' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Source' })).toBeVisible();
        await expect(page.locator("footer")).toBeVisible();
        await expect(page.locator("footer")).toContainText("Designed & Engineered by Zenithbuild");
    });

    test("zero errors on home page", async ({ page }) => {
        await page.goto(BASE, { waitUntil: "networkidle" });
        const fatalConsoleErrors = consoleErrors.filter((msg) => {
            return (
                msg.includes("__zenith_fragment is not defined") ||
                msg.includes("zenWindow is not defined") ||
                msg.includes("[Zenith Router] initial navigation failed")
            );
        });

        expect(fatalConsoleErrors).toHaveLength(0);
        expect(pageErrors).toHaveLength(0);
        expect(failedResponses).toHaveLength(0);
        expect(srcAssetRequests).toHaveLength(0);
    });

    test("menu toggle remains clickable and reactive", async ({ page }) => {
        await page.goto(BASE, { waitUntil: "networkidle" });

        const toggle = navToggle(page);
        const toggleLabel = page.locator('[data-testid="nav-toggle-label"]');
        const backdrop = page.locator('[data-testid="nav-backdrop"]');
        const shell = page.locator('[data-testid="nav-shell"]');
        await expect(toggle).toContainText("menu");
        await expect(toggleLabel.locator("div")).toHaveCount(4);

        const before = {
            backdropOpacity: await backdrop.evaluate((el) => getComputedStyle(el).opacity),
            shellHeight: await shell.evaluate((el) => getComputedStyle(el).height),
            shellTransform: await shell.evaluate((el) => getComputedStyle(el).transform),
        };

        await toggle.click();
        await expect(toggle).toContainText("close");
        await expect(toggleLabel.locator("div")).toHaveCount(5);
        await page.waitForTimeout(300);
        const afterOpen = {
            backdropOpacity: await backdrop.evaluate((el) => getComputedStyle(el).opacity),
            shellHeight: await shell.evaluate((el) => getComputedStyle(el).height),
            shellTransform: await shell.evaluate((el) => getComputedStyle(el).transform),
        };
        expect(
            Number(afterOpen.backdropOpacity) > 0 ||
            afterOpen.shellHeight !== before.shellHeight ||
            afterOpen.shellTransform !== before.shellTransform
        ).toBe(true);

        await page.waitForTimeout(1200);

        await toggle.click();
        await expect
            .poll(async () => (await toggle.textContent())?.trim(), { timeout: 1500 })
            .toContain("menu");
        await expect(toggleLabel.locator("div")).toHaveCount(4);
    });

    test("menu hover animates only its own overlay", async ({ page }) => {
        await page.goto(BASE, { waitUntil: "networkidle" });

        const menuButton = navToggle(page);
        const menuOverlay = menuButton.locator('[data-zen-btn-overlay]');
        const initButton = page.locator('[data-zen-btn]').filter({ hasText: 'Initialize' }).first();
        const initOverlay = initButton.locator('[data-zen-btn-overlay]');

        await page.mouse.move(5, 5);
        await page.waitForTimeout(120);

        const reset = {
            menu: await menuOverlay.evaluate((el) => getComputedStyle(el).transform),
            init: await initOverlay.evaluate((el) => getComputedStyle(el).transform),
        };

        await menuButton.hover();

        await expect
            .poll(
                async () => {
                    const after = {
                        menu: await menuOverlay.evaluate((el) => getComputedStyle(el).transform),
                        init: await initOverlay.evaluate((el) => getComputedStyle(el).transform),
                    };
                    return after.menu !== reset.menu && after.init === reset.init;
                },
                { timeout: 1200 }
            )
            .toBe(true);
    });

    test("footer reveal curve responds to scroll", async ({ page }) => {
        await page.goto(BASE, { waitUntil: "networkidle" });

        const curvePath = page.locator("#zenith-footer-curve-path");
        const initialCurve = await curvePath.getAttribute("d");

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

        await expect
            .poll(async () => curvePath.getAttribute("d"), { timeout: 1500 })
            .not.toBe(initialCurve);
    });
});
