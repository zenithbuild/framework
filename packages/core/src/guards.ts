export function containsForbiddenPattern(source: string, patterns: string[]): string[] {
    const found: string[] = [];
    for (const pattern of patterns) {
        if (source.includes(pattern)) {
            found.push(pattern);
        }
    }
    return found;
}

export { validateRouteParams } from './path.js';
export { validateConfig as validateConfigSchema } from './config.js';

export const FORBIDDEN_PATTERNS = [
    'eval(',
    'new Function(',
    'new Function (',
    'document.write('
];

export const BROWSER_GLOBALS = [
    'window',
    'document',
    'navigator',
    'localStorage',
    'sessionStorage'
];
