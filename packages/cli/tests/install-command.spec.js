import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageManager, devInstallCommand } from '../src/install-command.js';

let root;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'zenith-install-command-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

test.each([
    ['bun.lock', 'bun add -d x@1'],
    ['bun.lockb', 'bun add -d x@1'],
    ['pnpm-lock.yaml', 'pnpm add -D x@1'],
    ['yarn.lock', 'yarn add -D x@1'],
    ['package-lock.json', 'npm i -D x@1']
])('lockfile %s selects %s', async (lockfile, command) => {
    await writeFile(join(root, lockfile), '');
    expect(devInstallCommand(root, 'x@1', 'npm/10.0.0 node/v20')).toBe(command);
});

test('a workspace root lockfile applies to nested projects', async () => {
    await writeFile(join(root, 'pnpm-lock.yaml'), '');
    await mkdir(join(root, 'apps', 'site'), { recursive: true });
    expect(detectPackageManager(join(root, 'apps', 'site'), 'bun/1.4.2')).toBe('pnpm');
});

test.each([
    ['bun/1.4.2 npm/? node/v24.3.0 linux x64', 'bun'],
    ['pnpm/9.12.0 npm/? node/v20.19.2 linux x64', 'pnpm'],
    ['yarn/4.5.0 npm/? node/v20.19.2 linux x64', 'yarn'],
    ['npm/10.8.2 node/v20.19.2 linux x64', 'npm'],
    ['', 'npm']
])('without a lockfile, user agent %s selects %s', (agent, manager) => {
    expect(detectPackageManager(root, agent)).toBe(manager);
});
