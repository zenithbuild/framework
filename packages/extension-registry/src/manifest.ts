import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZenithExtensionMeta, ZenithExtensionRegistry, ZenithExtensionType } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedRegistry: ZenithExtensionRegistry | null = null;

function registryPath(): string {
    return join(__dirname, 'registry.json');
}

export function loadOfficialRegistry(): ZenithExtensionRegistry {
    if (cachedRegistry) {
        return cachedRegistry;
    }
    const raw = readFileSync(registryPath(), 'utf8');
    const parsed = JSON.parse(raw) as ZenithExtensionRegistry;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.packages)) {
        throw new Error('[Zenith:ExtensionRegistry] Invalid registry manifest shape');
    }
    cachedRegistry = parsed;
    return parsed;
}

export function listExtensions(type?: ZenithExtensionType): ZenithExtensionMeta[] {
    const registry = loadOfficialRegistry();
    if (!type) {
        return [...registry.packages];
    }
    return registry.packages.filter((entry) => entry.type === type);
}

export function findExtensionByName(name: string): ZenithExtensionMeta | null {
    const normalized = name.trim();
    return loadOfficialRegistry().packages.find((entry) => entry.name === normalized) ?? null;
}

export function findExtensionByAlias(type: ZenithExtensionType, alias: string): ZenithExtensionMeta | null {
    const normalized = alias.trim().toLowerCase();
    return (
        loadOfficialRegistry().packages.find(
            (entry) => entry.type === type && entry.alias?.toLowerCase() === normalized
        ) ?? null
    );
}

export function resolveExtension(query: string, type: ZenithExtensionType): ZenithExtensionMeta | null {
    const trimmed = query.trim();
    if (!trimmed) {
        return null;
    }
    const byName = findExtensionByName(trimmed);
    if (byName && byName.type === type) {
        return byName;
    }
    const byAlias = findExtensionByAlias(type, trimmed);
    if (byAlias) {
        return byAlias;
    }
    const registry = loadOfficialRegistry();
    const lower = trimmed.toLowerCase();
    return (
        registry.packages.find(
            (entry) => entry.type === type && entry.name.toLowerCase().includes(lower)
        ) ?? null
    );
}

export function searchExtensions(term: string, type?: ZenithExtensionType): ZenithExtensionMeta[] {
    const needle = term.trim().toLowerCase();
    if (!needle) {
        return [];
    }
    return listExtensions(type).filter((entry) => {
        const haystack = [
            entry.name,
            entry.alias,
            entry.displayName,
            entry.description
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(needle);
    });
}

export function resetRegistryCacheForTests(): void {
    cachedRegistry = null;
}
