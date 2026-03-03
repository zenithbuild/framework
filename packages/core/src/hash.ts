import { createHash } from 'node:crypto';

export function hash(content: string): string {
    const normalized = normalizeInput(content);
    return createHash('sha256').update(normalized).digest('hex');
}

export function hashShort(content: string, length = 8): string {
    return hash(content).slice(0, length);
}

function normalizeInput(content: string): string {
    let result = content.replace(/\\/g, '/');
    result = result.replace(/\n+$/, '');
    return result;
}
