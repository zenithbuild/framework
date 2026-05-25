import type { CompilerOptsLike, ScriptBlockPartition } from './types.js';

interface ScriptBlockMatch extends ScriptBlockPartition {
    full: string;
    index: number;
}

export function findScriptBlocks(source: string): ScriptBlockMatch[] {
    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    const blocks: ScriptBlockMatch[] = [];
    for (const match of String(source || '').matchAll(scriptRe)) {
        blocks.push({
            attrs: String(match[1] || ''),
            body: String(match[2] || ''),
            full: String(match[0] || ''),
            index: typeof match.index === 'number' ? match.index : -1
        });
    }
    return blocks;
}

export function partitionScriptBlocks(source: string): {
    serverBlocks: ScriptBlockPartition[];
    clientBlocks: ScriptBlockPartition[];
} {
    const serverBlocks: ScriptBlockPartition[] = [];
    const clientBlocks: ScriptBlockPartition[] = [];
    for (const block of findScriptBlocks(source)) {
        if (/\bserver\b/i.test(block.attrs)) {
            serverBlocks.push({ attrs: block.attrs, body: block.body });
        } else {
            clientBlocks.push({ attrs: block.attrs, body: block.body });
        }
    }
    return { serverBlocks, clientBlocks };
}

export function serverBlockRequiresLangTs(attrs: string, compilerOpts: CompilerOptsLike = {}): boolean {
    const hasLangTs = /\blang\s*=\s*["']ts["']/i.test(attrs);
    if (hasLangTs) {
        return false;
    }
    const hasLangJs = /\blang\s*=\s*["'](?:js|javascript)["']/i.test(attrs);
    const hasAnyLang = /\blang\s*=/i.test(attrs);
    return !compilerOpts.typescriptDefault || hasLangJs || hasAnyLang;
}
