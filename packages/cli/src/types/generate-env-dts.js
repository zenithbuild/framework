import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { renderZenithEnvDts } from './zenith-env-dts.js';

/**
 * @param {string} projectRoot
 * @returns {Promise<void>}
 */
export async function generateEnvDts(projectRoot) {
    const outPath = join(projectRoot, '.zenith', 'zenith-env.d.ts');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, renderZenithEnvDts(), 'utf8');
}
