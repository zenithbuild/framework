// PHASE innerHTML guard — deterministic component template injection.
// Contract focus:
// - Component template ONLY injected when host is empty (whitespace-only).
// - SSR-rendered content is NOT overwritten by mount().
// - Component scripts still execute when host has pre-rendered content.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';

jest.setTimeout(180000);

describe('Phase innerHTML guard', () => {
    test('component mount does not overwrite SSR-rendered host content', async () => {
        const root = await createTempProject('zenith-phase-innerhtml-guard');

        await scaffoldZenithProject(root, {
            router: false,
            pages: {
                'index.zen': `<script lang="ts">
import Counter from "../components/Counter.zen";
</script>
<main>
  <Counter />
</main>`
            },
            components: {
                'Counter.zen': `<script lang="ts">
const count = signal(0);
function inc() { count.set(count.get() + 1); }
</script>
<div data-counter data-counter-runtime>
  <p id="count">{count}</p>
  <button id="inc" on:click={inc}>+</button>
</div>`
            }
        });

        assertSuccess(npmInstall(root), 'npm install');
        assertSuccess(runCli(root, ['build']), 'zenith build');

        // Verify static runtime marker is present in SSR HTML output
        const distIndex = path.join(root, 'dist', 'index.html');
        const html = await fs.readFile(distIndex, 'utf8');
        expect(html).toContain('data-counter-runtime');

        // Verify generated component JS has the trim guard, not unconditional overwrite
        const distAssets = path.join(root, 'dist', 'assets');
        const componentFiles = (await fs.readdir(distAssets)).filter(
            (name) => name.startsWith('component.') && name.endsWith('.js')
        );

        expect(componentFiles.length).toBeGreaterThan(0);

        for (const file of componentFiles) {
            const content = await fs.readFile(path.join(distAssets, file), 'utf8');
            if (content.includes('__zenith_component_template')) {
                // Must use trim guard
                expect(content).toContain('host.innerHTML.trim().length === 0');
                // Must NOT use the old unconditional overwrite
                expect(content).not.toContain("typeof host.innerHTML === 'string'");
            }
        }

        // Also verify the component scripts execute and reactivity works
        const port = await getFreePort();
        const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
        const browser = await chromium.launch({ headless: true });

        try {
            await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
            const page = await browser.newPage();
            await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });

            // Component should render and be interactive
            expect(((await page.textContent('#count')) || '').trim()).toBe('0');
            await page.click('#inc');
            await page.waitForTimeout(120);
            expect(((await page.textContent('#count')) || '').trim()).toBe('1');

            await page.close();
        } finally {
            await browser.close();
            await preview.stop();
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
