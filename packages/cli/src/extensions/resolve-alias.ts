import {
    resolveExtension,
    type ZenithExtensionMeta,
    type ZenithExtensionType
} from '@zenithbuild/extension-registry';

export function resolveExtensionAlias(
    query: string,
    type: ZenithExtensionType
): ZenithExtensionMeta | null {
    return resolveExtension(query, type);
}

export function formatResolvedExtension(entry: ZenithExtensionMeta): string {
    const label = entry.alias ?? entry.name;
    return `${label} -> ${entry.name}`;
}
