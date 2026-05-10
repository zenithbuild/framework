import { readFileSync } from 'node:fs';
import path from 'node:path';

export function findPackageVersionForEntry(entryPath, packageName, options = {}) {
    const readFile = options.readFile || readFileSync;
    const pathApi = options.pathApi || path;
    let currentDir = pathApi.dirname(entryPath);
    const rootDir = pathApi.parse(currentDir).root;

    while (currentDir && currentDir !== rootDir) {
        try {
            const pkgTxt = readFile(pathApi.join(currentDir, 'package.json'), 'utf-8');
            const pkg = JSON.parse(pkgTxt);
            if (pkg.name === packageName) {
                return typeof pkg.version === 'string' ? pkg.version : null;
            }
        } catch {
            // Continue walking toward the filesystem root.
        }

        const nextDir = pathApi.dirname(currentDir);
        if (nextDir === currentDir) {
            break;
        }
        currentDir = nextDir;
    }

    return null;
}
