import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './project.js';
import { assertSuccess, getFreePort, runCommandSync, startProcess, waitForHttp } from './process.js';
import { diffHashPairs, hashTree } from './fs.js';

function createPrng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
}

function nextInt(next, maxExclusive) {
  if (maxExclusive <= 1) return 0;
  return next() % maxExclusive;
}

function componentTagName(id) {
  return `Comp${id}`;
}

function renderComponentTree(next, depth, maxDepth, maxBreadth, idRef) {
  const id = idRef.value++;
  const tag = componentTagName(id);

  let children = '';
  if (depth < maxDepth) {
    const shouldBranch = depth < 2 || nextInt(next, 100) < 65;
    if (shouldBranch) {
      const childCount = 1 + nextInt(next, maxBreadth);
      for (let i = 0; i < childCount; i += 1) {
        children += renderComponentTree(next, depth + 1, maxDepth, maxBreadth, idRef);
      }
    }
  }

  return `<${tag}>
  <script>
    const count = signal(0)
    function inc() { count.set(count.get() + 1) }
  </script>
  <button on:click={inc}>{count}</button>
  ${children}
</${tag}>`;
}

function generateFixture(seed, options = {}) {
  const maxDepth = options.maxDepth ?? 6;
  const maxBreadth = options.maxBreadth ?? 4;
  const next = createPrng(seed);
  const idRef = { value: 0 };

  const indexTree = renderComponentTree(next, 0, maxDepth, maxBreadth, idRef);
  const aboutTree = renderComponentTree(next, 0, Math.max(2, maxDepth - 2), maxBreadth, idRef);

  const usersId = 1 + nextInt(next, 99);
  const router = nextInt(next, 2) === 0;
  const pages = {
    'index.zen': `<main><h1>Stress ${seed}</h1><a id="about-link" href="/about">About</a><a id="user-link" href="/users/${usersId}">User</a>${indexTree}</main>`,
    'about.zen': `<main><h1>About ${seed}</h1><a id="home-link" href="/">Home</a>${aboutTree}</main>`,
    'users/[id].zen': '<main><h1 id="user-page">User {params.id}</h1></main>'
  };

  return { router, pages, usersId };
}

async function writeFixturePages(root, fixture) {
  const pagesDir = path.join(root, 'pages');
  await fs.rm(pagesDir, { recursive: true, force: true });
  await fs.mkdir(path.join(pagesDir, 'users'), { recursive: true });

  await fs.writeFile(path.join(root, 'zenith.config.js'), `export default {\n  router: ${fixture.router ? 'true' : 'false'}\n};\n`, 'utf8');

  for (const [rel, content] of Object.entries(fixture.pages)) {
    const abs = path.join(pagesDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }
}

async function verifyPlaywrightNavigation(root, expectedUserPath) {
  const port = await getFreePort();
  const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await page.click('#about-link', { timeout: 3000 });
    await page.waitForTimeout(250);
    await page.click('#home-link', { timeout: 3000 });
    await page.waitForTimeout(250);
    await page.click('#user-link', { timeout: 3000 });
    await page.waitForTimeout(250);

    const pathname = await page.evaluate(() => window.location.pathname);
    if (pathname !== expectedUserPath) {
      throw new Error(`expected pathname ${expectedUserPath}, got ${pathname}`);
    }
  } finally {
    await browser.close();
    await preview.stop();
  }
}

export async function runStressHarness(options = {}) {
  const fixtureCount = options.fixtureCount ?? 100;
  const maxDepth = options.maxDepth ?? 6;
  const maxBreadth = options.maxBreadth ?? 4;
  const playwrightSamples = options.playwrightSamples ?? 5;

  const root = await createTempProject('zenith-phase15');
  await scaffoldZenithProject(root, {
    router: true,
    pages: { 'index.zen': '<main><h1>Seed</h1></main>' }
  });

  assertSuccess(npmInstall(root), 'npm install');

  const fixtureSummaries = [];

  for (let i = 0; i < fixtureCount; i += 1) {
    const seed = i + 1;
    const fixture = generateFixture(seed, { maxDepth, maxBreadth });
    await writeFixturePages(root, fixture);

    const buildA = runCli(root, ['build']);
    assertSuccess(buildA, `zenith build fixture#${seed} passA`);
    const hashA = await hashTree(path.join(root, 'dist'));

    const buildB = runCli(root, ['build']);
    assertSuccess(buildB, `zenith build fixture#${seed} passB`);
    const hashB = await hashTree(path.join(root, 'dist'));

    const diffs = diffHashPairs(hashA, hashB);
    if (diffs.length > 0) {
      throw new Error(`determinism drift fixture#${seed}: ${JSON.stringify(diffs.slice(0, 5))}`);
    }

    if (i < playwrightSamples && fixture.router) {
      await verifyPlaywrightNavigation(root, `/users/${fixture.usersId}`);
    }

    fixtureSummaries.push({
      seed,
      router: fixture.router,
      files: hashA.length
    });
  }

  const hasBun = runCommandSync('bun', ['--version']).status === 0;
  if (hasBun) {
    const fixture = generateFixture(9001, { maxDepth, maxBreadth });
    await writeFixturePages(root, fixture);

    const npmBuild = runCli(root, ['build']);
    assertSuccess(npmBuild, 'npm build (pm parity)');
    const npmHashes = await hashTree(path.join(root, 'dist'));

    await fs.rm(path.join(root, 'node_modules'), { recursive: true, force: true });
    await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });
    await fs.rm(path.join(root, 'package-lock.json'), { force: true });
    await fs.rm(path.join(root, 'bun.lockb'), { force: true });

    const bunInstall = runCommandSync('bun', ['install'], { cwd: root });
    assertSuccess(bunInstall, 'bun install (pm parity)');
    const bunBuild = runCommandSync('bun', ['run', 'build'], { cwd: root });
    assertSuccess(bunBuild, 'bun build (pm parity)');
    const bunHashes = await hashTree(path.join(root, 'dist'));

    const diffs = diffHashPairs(npmHashes, bunHashes);
    if (diffs.length > 0) {
      throw new Error(`npm/bun drift in stress harness: ${JSON.stringify(diffs.slice(0, 5))}`);
    }
  }

  await fs.rm(root, { recursive: true, force: true });
  return {
    fixtureCount,
    maxDepth,
    maxBreadth,
    fixtures: fixtureSummaries
  };
}
