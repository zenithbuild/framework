// PHASE 7 — Preview contract.
// Contract: preview serves built dist only, no compile path on preview,
// and route status behavior is deterministic.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';
import { hashTree } from './helpers/fs.js';

jest.setTimeout(120000);

describe('Phase 7: preview contract', () => {
  test('preview serves dist as-is and does not trigger compile step', async () => {
    const root = await createTempProject('zenith-phase7');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': '<div><h1>Preview Home</h1></div>',
        'about.zen': '<div><h1>Preview About</h1></div>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const distDir = path.join(root, 'dist');
    const prePreviewHashes = await hashTree(distDir);

    // Preview must not compile from source. Remove pages to enforce this seam.
    await fs.rename(path.join(root, 'pages'), path.join(root, 'pages.off'));

    const port = await getFreePort();
    const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });

    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 30000 });

      const home = await fetch(`http://localhost:${port}/`);
      const missing = await fetch(`http://localhost:${port}/does-not-exist`);

      expect(home.status).toBe(200);
      expect(missing.status).toBe(404);

      const served = await home.text();
      const built = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
      expect(served).toBe(built);

      const logs = preview.logs();
      expect(logs.stdout.includes('Building')).toBe(false);
      expect(logs.stderr.includes('Building')).toBe(false);

      const postPreviewHashes = await hashTree(distDir);
      expect(postPreviewHashes).toEqual(prePreviewHashes);
    } finally {
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('preview rewrites only manifest-backed dynamic routes and blocks traversal paths', async () => {
    const root = await createTempProject('zenith-phase7-router');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': '<div><h1>Home</h1><a href="/users/42">User</a></div>',
        'about.zen': '<div><h1>About</h1></div>',
        'users/[id].zen': '<div><h1 id="user">{params.id}</h1></div>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const distDir = path.join(root, 'dist');
    const manifest = JSON.parse(
      await fs.readFile(path.join(distDir, 'assets', 'router-manifest.json'), 'utf8')
    );
    const routePaths = Array.isArray(manifest.routes)
      ? manifest.routes.map((entry) => entry.path).sort()
      : [];
    expect(routePaths).toEqual(['/', '/about', '/users/:id']);

    const port = await getFreePort();
    const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });

    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 30000 });

      const dynamic = await fetch(`http://localhost:${port}/users/42`);
      const unknown = await fetch(`http://localhost:${port}/unknown/42`);
      const traversal = await fetch(`http://localhost:${port}/%2e%2e/%2e%2e/etc/passwd`);

      expect(dynamic.status).toBe(200);
      expect(unknown.status).toBe(404);
      expect(traversal.status).toBe(404);
    } finally {
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
