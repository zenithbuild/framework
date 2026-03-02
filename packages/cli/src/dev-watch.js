import { stat } from 'node:fs/promises';

export async function readChangeFingerprint(absPath) {
    try {
        const info = await stat(absPath);
        const kind = info.isDirectory()
            ? 'dir'
            : info.isFile()
                ? 'file'
                : 'other';
        return `${kind}:${info.mtimeMs}:${info.size}`;
    } catch (error) {
        const code = error && typeof error === 'object' ? error.code : '';
        if (code === 'ENOENT' || code === 'ENOTDIR') {
            return 'missing';
        }
        return `error:${String(code || 'unknown')}`;
    }
}
