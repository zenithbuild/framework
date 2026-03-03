export interface ZenithError extends Error {
    zenithModule: string;
}

export function createError(module: string, message: string): ZenithError {
    const err = new Error(`[Zenith:${module}] ${message}`) as ZenithError;
    err.zenithModule = module;
    return err;
}

export function formatError(module: string, message: string): string {
    return `[Zenith:${module}] ${message}`;
}

export function isZenithError(err: Error | unknown): err is ZenithError {
    return err instanceof Error && typeof (err as Partial<ZenithError>).zenithModule === 'string';
}

export const ErrorCodes = {
    CONFIG_UNKNOWN_KEY: 'CONFIG_UNKNOWN_KEY',
    CONFIG_INVALID_TYPE: 'CONFIG_INVALID_TYPE',
    CONFIG_EMPTY_VALUE: 'CONFIG_EMPTY_VALUE',
    PATH_REPEATED_PARAM: 'PATH_REPEATED_PARAM',
    VERSION_INCOMPATIBLE: 'VERSION_INCOMPATIBLE',
    GUARD_VIOLATION: 'GUARD_VIOLATION'
} as const;
