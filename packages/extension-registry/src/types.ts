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
