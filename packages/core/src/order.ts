export interface RouteEntry {
    path: string;
}

function isDynamicRoute(routePath: string): boolean {
    return routePath.includes(':');
}

export function sortRoutes<T extends RouteEntry>(entries: T[]): T[] {
    return [...entries].sort((a, b) => {
        const aDynamic = isDynamicRoute(a.path);
        const bDynamic = isDynamicRoute(b.path);

        if (!aDynamic && bDynamic) return -1;
        if (aDynamic && !bDynamic) return 1;

        return a.path.localeCompare(b.path);
    });
}

export function sortAlpha(items: string[]): string[] {
    return [...items].sort((a, b) => a.localeCompare(b));
}

export function isCorrectOrder<T extends RouteEntry>(entries: T[]): boolean {
    const sorted = sortRoutes(entries);
    return entries.every((entry, i) => entry.path === sorted[i]?.path);
}
