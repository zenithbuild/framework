// PHASE SERVER SCRIPT PRERENDER — <script server> compile/build contract.
// Contract focus:
// - prerender=true must produce deterministic ssr_data in emitted page module.
// - Router manifest should persist prerender metadata.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';

jest.setTimeout(120000);

describe('Phase server-script prerender', () => {
  test('embeds prerendered ssr_data and marks route metadata', async () => {
    const root = await createTempProject('zenith-phase-prerender');
    try {
      await scaffoldZenithProject(root, {
        router: true,
        pages: {
          'index.zen': `<script server lang="ts">
export const prerender = true
export const ssr = { user: { name: 'Ada' } }
</script>
<main><h1 id="name">{ssr.user.name}</h1></main>`
        }
      });

      assertSuccess(npmInstall(root), 'npm install');
      assertSuccess(runCli(root, ['build']), 'zenith build');

      const distDir = path.join(root, 'dist');
      const buildManifest = JSON.parse(
        await fs.readFile(path.join(distDir, 'manifest.json'), 'utf8')
      );
      const pageAsset = typeof buildManifest?.chunks?.['/'] === 'string'
        ? buildManifest.chunks['/'].replace(/^\//, '')
        : null;
      expect(pageAsset).not.toBeNull();

      const pageSource = await fs.readFile(path.join(distDir, pageAsset), 'utf8');
      expect(/\buser\b/.test(pageSource)).toBe(true);
      expect(pageSource.includes('"Ada"') || pageSource.includes("'Ada'")).toBe(true);

      const manifest = JSON.parse(
        await fs.readFile(path.join(distDir, 'assets', 'router-manifest.json'), 'utf8')
      );
      const indexRoute = manifest.routes.find((route) => route.path === '/');
      expect(indexRoute).toBeDefined();
      expect(indexRoute.prerender).toBe(true);
      expect(indexRoute.ssr_data).toEqual({ user: { name: 'Ada' } });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
