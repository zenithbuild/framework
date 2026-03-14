export const TRANSITION_PROTOTYPE_HOOKS = [
  "navigation:request",
  "navigation:before-leave",
  "navigation:before-swap",
  "navigation:content-swapped",
  "navigation:before-enter",
  "navigation:enter-complete",
  "navigation:abort",
  "navigation:error",
] as const;

export interface TransitionPrototypeContent {
  routes?: string[];
  eyebrow?: string;
  label?: string;
  links?: Array<{ label?: string; href?: string }>;
}

type RouteLike = URL | { pathname?: string | null } | null | undefined;

function readPrototypeHash(routeLike: URL | { hash?: string | null } | null | undefined): string {
  if (!routeLike) {
    return "";
  }

  if (routeLike instanceof URL) {
    return routeLike.hash || "";
  }

  if (typeof routeLike === "object" && typeof routeLike.hash === "string") {
    return routeLike.hash;
  }

  return "";
}

export function normalizePrototypePath(pathname: string | null | undefined): string {
  if (!pathname || pathname.trim().length === 0) {
    return "";
  }

  if (pathname === "/") {
    return "/";
  }

  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}

export function resolvePrototypeRoutes(content: TransitionPrototypeContent | null | undefined): string[] {
  const rawRoutes = Array.isArray(content?.routes) ? content.routes : [];
  const normalized = rawRoutes
    .map((route) => normalizePrototypePath(route))
    .filter((route) => route.length > 0);

  return Array.from(new Set(normalized));
}

export function readPrototypePath(routeLike: RouteLike): string {
  if (!routeLike) {
    return "";
  }

  if (routeLike instanceof URL) {
    return normalizePrototypePath(routeLike.pathname);
  }

  if (typeof routeLike === "object" && typeof routeLike.pathname === "string") {
    return normalizePrototypePath(routeLike.pathname);
  }

  return "";
}

export function isPrototypeRoute(pathname: string, routes: string[]): boolean {
  const normalizedPath = normalizePrototypePath(pathname);
  if (normalizedPath.length === 0) {
    return false;
  }

  return routes.includes(normalizedPath);
}

export function isPrototypeTransitionNavigation(
  payload: { from?: RouteLike; to?: RouteLike } | null | undefined,
  routes: string[],
): boolean {
  const fromPath = readPrototypePath(payload?.from);
  const toPath = readPrototypePath(payload?.to);
  const toHash = readPrototypeHash(payload?.to);

  if (fromPath.length === 0 || toPath.length === 0 || fromPath === toPath) {
    return false;
  }

  if (toPath === "/docs" && toHash.length > 0) {
    return false;
  }

  return isPrototypeRoute(fromPath, routes) && isPrototypeRoute(toPath, routes);
}
