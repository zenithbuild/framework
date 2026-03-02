// PHASE 16 — Forbidden primitive static scans across templates and emitted assets.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';
import { repoRoot } from './helpers/paths.js';
import { stripCommentsAndStrings } from './helpers/source-scan.js';
import { walkFilesDeterministic } from './helpers/fs.js';

jest.setTimeout(240000);

const FORBIDDEN_PATTERNS = [
  /Date\s*\(/,
  /new\s+Date\s*\(/,
  /Math\.random\s*\(/,
  /crypto\.randomUUID\s*\(/,
  /eval\s*\(/,
  /new\s+Function\s*\(/,
  /process\.env/,
  /\brequire\s*\(/
];

async function scanDirForPatterns(rootDir, patterns, exts) {
  const files = await walkFilesDeterministic(rootDir);
  const hits = [];

  for (const rel of files) {
    if (!exts.includes(path.extname(rel))) {
      continue;
    }
    const abs = path.join(rootDir, rel);
    const source = await fs.readFile(abs, 'utf8');
    const stripped = stripCommentsAndStrings(source);
    for (const pattern of patterns) {
      if (pattern.test(stripped)) {
        hits.push({ file: abs, pattern: pattern.toString() });
      }
    }
  }

  return hits;
}

describe('Phase 16: forbidden primitive lock', () => {
  test('create-zenith templates contain no forbidden primitives', async () => {
    const templatesDir = path.join(repoRoot, 'create-zenith', 'templates');
    const hits = await scanDirForPatterns(templatesDir, FORBIDDEN_PATTERNS, ['.js', '.ts', '.zen', '.html', '.css']);
    expect(hits).toEqual([]);
  });

  test('emitted assets contain no forbidden primitives and no bare @zenithbuild imports', async () => {
    const root = await createTempProject('zenith-phase16');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': `<main>
  <Card>
    <script>
      const count = signal(0)
      function inc() { count.set(count.get() + 1) }
    </script>
    <button on:click={inc}>{count}</button>
  </Card>
  <a href="/about" id="about-link">About</a>
</main>`,
        'about.zen': '<main><h1>About</h1><a href="/" id="home-link">Home</a></main>',
        'users/[id].zen': '<main><h1>{params.id}</h1></main>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const distDir = path.join(root, 'dist');
    const hits = await scanDirForPatterns(distDir, FORBIDDEN_PATTERNS, ['.js', '.html']);
    expect(hits).toEqual([]);

    const files = await walkFilesDeterministic(distDir);
    const jsFiles = files.filter((file) => file.endsWith('.js'));
    for (const rel of jsFiles) {
      const source = await fs.readFile(path.join(distDir, rel), 'utf8');
      expect(source.includes('@zenithbuild/')).toBe(false);
    }

    await fs.rm(root, { recursive: true, force: true });
  });
});
