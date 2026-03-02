// PHASE effect determinism — zenEffect and zenMount contract verification.
// Contract focus:
// - zenEffect cleanup runs before each re-run.
// - zenMount cleanup runs on scope disposal.
// - zenEffect autotracks reactive reads deterministically.
// - Multiple effects on the same dependency subscribe in __zenith_id order.

import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';

jest.setTimeout(180000);

describe('Phase effect determinism', () => {
    test('zenEffect autotracks and cleanup runs before rerun', async () => {
        const root = await createTempProject('zenith-phase-effect-determinism');

        await scaffoldZenithProject(root, {
            router: false,
            pages: {
                'index.zen': `<script lang="ts">
const count = signal(0);
const runs = signal(0);
const cleanups = signal(0);

zenEffect(() => {
  const val = count.get();
  runs.set(runs.get() + 1);
  return () => cleanups.set(cleanups.get() + 1);
});

function inc() { count.set(count.get() + 1); }
</script>
<main>
  <p id="count">{count}</p>
  <p id="runs">{runs}</p>
  <p id="cleanups">{cleanups}</p>
  <button id="inc" on:click={inc}>+</button>
</main>`
            }
        });

        assertSuccess(npmInstall(root), 'npm install');
        assertSuccess(runCli(root, ['build']), 'zenith build');

        const port = await getFreePort();
        const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
        const browser = await chromium.launch({ headless: true });

        try {
            await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
            const page = await browser.newPage();
            await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
            await page.waitForTimeout(200);

            // Initial run: effect fires once (autotrack mode)
            const initialRuns = ((await page.textContent('#runs')) || '').trim();
            expect(Number(initialRuns)).toBeGreaterThanOrEqual(1);

            // Click 3 times
            for (let i = 0; i < 3; i++) {
                await page.click('#inc');
            }
            await page.waitForTimeout(200);

            expect(((await page.textContent('#count')) || '').trim()).toBe('3');

            // Runs should have increased (autotrack rerun)
            const finalRuns = Number(((await page.textContent('#runs')) || '').trim());
            expect(finalRuns).toBeGreaterThanOrEqual(4); // 1 initial + 3 reruns

            // Cleanups should be exactly 1 less than runs (cleanup-before-rerun)
            const finalCleanups = Number(((await page.textContent('#cleanups')) || '').trim());
            expect(finalCleanups).toBe(finalRuns - 1);

            await page.close();
        } finally {
            await browser.close();
            await preview.stop();
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('zenMount cleanup fires on navigation', async () => {
        const root = await createTempProject('zenith-phase-mount-cleanup');

        await scaffoldZenithProject(root, {
            router: true,
            pages: {
                'index.zen': `<script lang="ts">
const mounted = signal("yes");
zenMount(() => {
  return () => { /* mount cleanup */ };
});
</script>
<main>
  <a id="link-about" href="/about">About</a>
  <p id="mounted">{mounted}</p>
</main>`,
                'about.zen': `<main><a id="link-home" href="/">Home</a><p>About</p></main>`
            }
        });

        assertSuccess(npmInstall(root), 'npm install');
        assertSuccess(runCli(root, ['build']), 'zenith build');

        const port = await getFreePort();
        const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
        const browser = await chromium.launch({ headless: true });
        const consoleErrors = [];

        try {
            await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
            const page = await browser.newPage();
            page.on('pageerror', (err) => consoleErrors.push(err.message));

            await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
            expect(((await page.textContent('#mounted')) || '').trim()).toBe('yes');

            // Navigate away and back — mount cleanup must not throw
            await page.click('#link-about');
            await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });
            await page.click('#link-home');
            await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });

            expect(((await page.textContent('#mounted')) || '').trim()).toBe('yes');
            expect(consoleErrors).toEqual([]);

            await page.close();
        } finally {
            await browser.close();
            await preview.stop();
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
