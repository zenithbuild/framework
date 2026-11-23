import { expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli } from '../../dist/index.js';

export async function createProject(files) {
    const root = join(tmpdir(), `zenith-platform-node-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

export async function buildNodeArtifact(root) {
    await cli(['build'], root);
    const result = spawnSync('bun', ['install'], { cwd: join(root, 'dist'), encoding: 'utf8' });
    expect(result.status).toBe(0);
}

export function extractSsrPayload(html) {
    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(String(payloadMatch[1]));
}

export function cookieHeaderFromResponse(response) {
    const raw = response.headers.get('set-cookie');
    if (!raw) {
        return '';
    }
    return raw.split(/,(?=[^;]+=[^;]+)/).map((value) => value.split(';')[0].trim()).join('; ');
}

export async function fetchBytes(url, options = {}) {
    const response = await fetch(url, {
        redirect: 'manual',
        ...options
    });
    return {
        status: response.status,
        headers: response.headers,
        body: Buffer.from(await response.arrayBuffer())
    };
}
