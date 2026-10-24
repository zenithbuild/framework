export type RouteGroup =
  | "home"
  | "marketing"
  | "blog-index"
  | "blog-article"
  | "docs-index"
  | "docs-article"
  | "unknown";

export interface RouteIdentity {
  path: string;
  group: RouteGroup;
  label: string;
}

export const ROUTE_IDENTITIES: Record<string, RouteIdentity> = {
  "/": { path: "/", group: "home", label: "Home" },
  "/about": { path: "/about", group: "marketing", label: "About" },
  "/blog": { path: "/blog", group: "blog-index", label: "Blog" },
  "/blog/building-zenith-0-8": {
    path: "/blog/building-zenith-0-8",
    group: "blog-article",
    label: "Building Zenith 0.8",
  },
  "/docs": { path: "/docs", group: "docs-index", label: "Documentation" },
  "/docs/getting-started": {
    path: "/docs/getting-started",
    group: "docs-article",
    label: "Getting Started",
  },
};

function hasUnsupportedUrlShape(value: string) {
  return value.includes("#") || /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(value);
}

export function normalizeRoutePath(value: string | URL | null | undefined): string {
  const raw = value instanceof URL ? value.pathname : typeof value === "string" ? value.trim() : "";
  if (!raw || hasUnsupportedUrlShape(raw)) return "";
  const pathname = raw.split("?", 1)[0];
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "";
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function classifyRoute(value: string | URL | null | undefined): RouteGroup {
  const path = normalizeRoutePath(value);
  const exact = ROUTE_IDENTITIES[path];
  if (exact) return exact.group;
  if (/^\/blog\/[^/]+$/.test(path)) return "blog-article";
  if (/^\/docs\/.+/.test(path)) return "docs-article";
  return "unknown";
}

export function getRouteIdentity(value: string | URL | null | undefined): RouteIdentity {
  const path = normalizeRoutePath(value);
  const exact = ROUTE_IDENTITIES[path];
  if (exact) return exact;
  const group = classifyRoute(path);
  return {
    path,
    group,
    label: group === "blog-article" ? "Article" : group === "docs-article" ? "Documentation" : "",
  };
}

function isDocsHierarchy(group: RouteGroup) {
  return group === "docs-index" || group === "docs-article";
}

export function shouldUseBrandedTransition(
  fromValue: string | URL | null | undefined,
  toValue: string | URL | null | undefined,
) {
  const from = getRouteIdentity(fromValue);
  const to = getRouteIdentity(toValue);
  if (!from.path || !to.path || from.path === to.path) return false;
  if (from.group === "unknown" || to.group === "unknown") return false;
  if (isDocsHierarchy(from.group) && isDocsHierarchy(to.group)) return false;
  return true;
}
