export function normalizeSeparators(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

export function fileToRoute(filePath: string, extension = '.zen'): string {
    let route = normalizeSeparators(filePath);

    if (route.endsWith(extension)) {
        route = route.slice(0, -extension.length);
    }

    route = route.replace(/\[([^\]]+)\]/g, ':$1');

    if (route === 'index') {
        return '/';
    }
    if (route.endsWith('/index')) {
        route = route.slice(0, -'/index'.length);
    }

    if (!route.startsWith('/')) {
        route = `/${route}`;
    }

    return route;
}

export function extractParams(routePath: string): string[] {
    const params: string[] = [];
    const segments = routePath.split('/');
    for (const segment of segments) {
        if (segment.startsWith(':')) {
            params.push(segment.slice(1));
        }
    }
    return params;
}

export function isDynamic(routePath: string): boolean {
    return routePath.includes(':');
}

export function validateRouteParams(routePath: string): void {
    const params = extractParams(routePath);
    const seen = new Set<string>();
    for (const param of params) {
        if (seen.has(param)) {
            throw new Error(
                `[Zenith:Path] Repeated parameter name ":${param}" in route "${routePath}"`
            );
        }
        seen.add(param);
    }
}

export function canonicalize(routePath: string): string {
    let path = normalizeSeparators(routePath);

    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }

    if (!path.startsWith('/')) {
        path = `/${path}`;
    }

    return path;
}
