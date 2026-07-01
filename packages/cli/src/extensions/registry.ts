export type ZenithExtensionType = 'plugin' | 'adapter';

export interface ZenithExtensionMeta {
    name: string;
    type: ZenithExtensionType;
    alias?: string;
    official?: boolean;
    installable?: boolean;
    fallbackTarget?: string;
    framework?: string;
    displayName?: string;
    description?: string;
    entry?: string;
}

export interface ZenithExtensionRegistry {
    schemaVersion: number;
    packages: ZenithExtensionMeta[];
}

const OFFICIAL_REGISTRY: ZenithExtensionRegistry = {
    schemaVersion: 1,
    packages: [
        {
            name: '@zenithbuild/adapter-vercel',
            type: 'adapter',
            alias: 'vercel',
            official: true,
            installable: false,
            fallbackTarget: 'vercel',
            displayName: 'Vercel Adapter',
            description: 'Builds Zenith apps for Vercel deployment.'
        },
        {
            name: '@zenithbuild/adapter-netlify',
            type: 'adapter',
            alias: 'netlify',
            official: true,
            installable: false,
            fallbackTarget: 'netlify',
            displayName: 'Netlify Adapter',
            description: 'Builds Zenith apps for Netlify deployment.'
        },
        {
            name: '@zenithbuild/plugin-image',
            type: 'plugin',
            alias: 'image',
            official: true,
            installable: false,
            displayName: 'Image Plugin',
            description: 'Optimized image component and image asset pipeline.'
        },
        {
            name: '@zenithbuild/plugin-content',
            type: 'plugin',
            alias: 'content',
            official: true,
            installable: false,
            displayName: 'Content Plugin',
            description: 'Markdown/content loading pipeline with remark support.'
        }
    ]
};

export function loadOfficialRegistry(): ZenithExtensionRegistry {
    return OFFICIAL_REGISTRY;
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
    // Kept for parity with the unpublished registry package API.
}
