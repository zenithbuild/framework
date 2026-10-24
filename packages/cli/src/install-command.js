import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const LOCKFILES = [
    ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'], ['package-lock.json', 'npm']
];
const DEV_INSTALL = { bun: 'bun add -d', pnpm: 'pnpm add -D', yarn: 'yarn add -D', npm: 'npm i -D' };

/**
 * The project's lockfile wins (nearest directory up, so workspaces resolve to
 * their root); otherwise use the package manager running this command.
 *
 * @param {string} projectRoot
 * @param {string | undefined} [userAgent]
 * @returns {'bun' | 'pnpm' | 'yarn' | 'npm'}
 */
export function detectPackageManager(projectRoot, userAgent = process.env.npm_config_user_agent) {
    for (let dir = resolve(projectRoot); ; dir = dirname(dir)) {
        const match = LOCKFILES.find(([file]) => existsSync(join(dir, file)));
        if (match) return /** @type {'bun' | 'pnpm' | 'yarn' | 'npm'} */ (match[1]);
        if (dirname(dir) === dir) break;
    }
    const agent = /^(bun|pnpm|yarn|npm)\//.exec(String(userAgent || ''))?.[1];
    return /** @type {'bun' | 'pnpm' | 'yarn' | 'npm'} */ (agent || 'npm');
}

/**
 * @param {string} projectRoot
 * @param {string} spec
 * @param {string | undefined} [userAgent]
 */
export function devInstallCommand(projectRoot, spec, userAgent) {
    return `${DEV_INSTALL[detectPackageManager(projectRoot, userAgent)]} ${spec}`;
}
