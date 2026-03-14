export const PROVEN_SOFT_NAV_ROUTE_ENTRIES = ["/", "/about", "/blog", "/docs"] as const;

export type SiteLinkClass =
  | "invalid"
  | "external"
  | "hash"
  | "proven-route-entry"
  | "internal-fallback";

const PROVEN_ROUTE_ENTRY_SET = new Set<string>(PROVEN_SOFT_NAV_ROUTE_ENTRIES);

export function normalizeRouteEntryHref(href: string | null | undefined): string {
  const hrefValue = typeof href === "string" ? href.trim() : "";
  if (hrefValue.length === 0) {
    return "";
  }

  const pathname = hrefValue.split("#", 1)[0].split("?", 1)[0];
  if (pathname.length === 0) {
    return "";
  }

  if (pathname === "/") {
    return "/";
  }

  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}

export function isExternalHref(href: string | null | undefined): boolean {
  const hrefValue = typeof href === "string" ? href.trim() : "";
  if (hrefValue.length === 0) {
    return false;
  }

  return /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(hrefValue);
}

export function isHashHref(href: string | null | undefined): boolean {
  const hrefValue = typeof href === "string" ? href.trim() : "";
  if (hrefValue.length === 0) {
    return false;
  }

  return hrefValue.startsWith("#") || hrefValue.includes("#");
}

export function isInternalHref(href: string | null | undefined): boolean {
  const hrefValue = typeof href === "string" ? href.trim() : "";
  if (hrefValue.length === 0) {
    return false;
  }

  return hrefValue.startsWith("/") && !hrefValue.startsWith("//");
}

export function isProvenSoftNavRouteEntry(href: string | null | undefined): boolean {
  const hrefValue = typeof href === "string" ? href.trim() : "";
  if (!isInternalHref(hrefValue) || hrefValue.includes("?") || hrefValue.includes("#")) {
    return false;
  }

  return PROVEN_ROUTE_ENTRY_SET.has(normalizeRouteEntryHref(hrefValue));
}

export function classifySiteHref(href: string | null | undefined): SiteLinkClass {
  const hrefValue = typeof href === "string" ? href.trim() : "";
  if (hrefValue.length === 0) {
    return "invalid";
  }

  if (isExternalHref(hrefValue)) {
    return "external";
  }

  if (isHashHref(hrefValue)) {
    return "hash";
  }

  if (isProvenSoftNavRouteEntry(hrefValue)) {
    return "proven-route-entry";
  }

  if (isInternalHref(hrefValue)) {
    return "internal-fallback";
  }

  return "external";
}

export function mergeLinkRel(target: string | null | undefined, rel: string | null | undefined): string {
  const targetValue = typeof target === "string" ? target.trim() : "";
  const relValue = typeof rel === "string" ? rel.trim() : "";
  if (targetValue !== "_blank") {
    return relValue;
  }

  const tokens = new Set(
    relValue
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  );
  tokens.add("noopener");
  tokens.add("noreferrer");
  return Array.from(tokens).join(" ");
}
