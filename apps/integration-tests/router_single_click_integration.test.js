import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';

import { getFreePort, startProcess } from './helpers/process.js';
import { cliEntry, repoRoot } from './helpers/paths.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevReady(dev, url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const logs = dev.logs();
    if (/Dev server running at http:\/\/localhost:\d+/.test(logs.stdout)) {
      return;
    }

    if (dev.proc.exitCode !== null) {
      throw new Error(
        `zenith dev exited early with code ${dev.proc.exitCode}\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`
      );
    }

    try {
      const res = await fetch(url);
      if (res.status === 200) {
        return;
      }
    } catch {
      // keep polling until timeout
    }

    await sleep(150);
  }

  const logs = dev.logs();
  throw new Error(
    `Timed out waiting for zenith dev at ${url}\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`
  );
}

test('single click internal navigation updates UI on first click', { timeout: 120000 }, async () => {
  const siteRoot = path.join(repoRoot, 'zenith-site-v0');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const dev = startProcess('node', [cliEntry, 'dev', String(port)], {
    cwd: siteRoot,
    env: { ...process.env }
  });

  let browser = null;
  try {
    await waitForDevReady(dev, `${baseUrl}/`, 20000);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const homeMarker = 'Ship exact HTML, CSS, and JS from static intent.';
    const aboutMarker = 'Move certainty upstream.';

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.getByText(homeMarker, { exact: true }).waitFor({ timeout: 10000 });

    await page.locator('a[href="/about"]').first().click({ timeout: 10000 });

    await page.waitForFunction(() => window.location.pathname === '/about', { timeout: 10000 });
    await page.getByText(aboutMarker, { exact: true }).waitFor({ timeout: 10000 });

    assert.equal(await page.getByText(aboutMarker, { exact: true }).isVisible(), true);
    assert.equal(
      await page.getByText(homeMarker, { exact: true }).isVisible().catch(() => false),
      false,
      'home marker should be gone after navigation to /about'
    );

    await page.waitForTimeout(1200);
    await page.getByText(aboutMarker, { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(
      await page.evaluate(() => window.location.pathname),
      '/about',
      'router should not revert path after initial navigation'
    );
  } finally {
    if (browser) {
      await browser.close();
    }
    await dev.stop();
  }

  assert.notEqual(dev.proc.exitCode, null, 'dev process must be terminated during cleanup');
});
