import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function isPackageInstalled(projectRoot: string, packageName: string): boolean {
    const pkgJson = join(projectRoot, 'node_modules', ...packageName.split('/'), 'package.json');
    return existsSync(pkgJson);
}

export function readInstalledZenithMetadata(
    projectRoot: string,
    packageName: string
): Record<string, unknown> | null {
    const pkgJsonPath = join(projectRoot, 'node_modules', ...packageName.split('/'), 'package.json');
    if (!existsSync(pkgJsonPath)) {
        return null;
    }
    try {
        const parsed = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { zenith?: Record<string, unknown> };
        return parsed.zenith ?? null;
    } catch {
        return null;
    }
}
