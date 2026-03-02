import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { repoRoot, cliEntry } from './paths.js';
import { runCommandSync } from './process.js';
import { ensureDir, writeText } from './fs.js';

function fileDep(absPath) {
  return `file:${absPath}`;
}

export async function createTempProject(prefix) {
  return await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

export async function scaffoldZenithProject(rootDir, options = {}) {
  const router = options.router === true;
  const pages = options.pages || {
    'index.zen': '<div>Home</div>'
  };

  const packageJson = {
    name: 'zenith-integration-fixture',
    private: true,
    type: 'module',
    scripts: {
      build: 'zenith build',
      dev: 'zenith dev',
      preview: 'zenith preview'
    },
    dependencies: {
      '@zenithbuild/cli': fileDep(path.join(repoRoot, 'zenith-cli')),
      '@zenithbuild/compiler': fileDep(path.join(repoRoot, 'zenith-compiler'))
    }
  };

  await writeText(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );

  await writeText(
    path.join(rootDir, 'zenith.config.js'),
    `export default {\n  router: ${router ? 'true' : 'false'}\n};\n`
  );

  await ensureDir(path.join(rootDir, 'pages'));
  for (const [rel, content] of Object.entries(pages)) {
    await writeText(path.join(rootDir, 'pages', rel), content);
  }
}

export function npmInstall(projectRoot) {
  const result = runCommandSync('npm', ['install', '--silent'], { cwd: projectRoot });
  return result;
}

export function bunInstall(projectRoot) {
  const result = runCommandSync('bun', ['install'], { cwd: projectRoot });
  return result;
}

export function runCli(projectRoot, commandArgs) {
  return runCommandSync('node', [cliEntry, ...commandArgs], { cwd: projectRoot });
}
