import type { PersonProfile, SiteImage, SiteSettings, SponsorProfile } from "../content/models";

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentValidationError";
  }
}

export function cleanContentText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function safePublicUrl(value: unknown, allowRelative = true): string | null {
  const input = cleanContentText(value);
  if (!input) return null;
  if (allowRelative && input.startsWith("/") && !input.startsWith("//")) return input;

  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeSiteImage(value: unknown, fallbackAlt: string): SiteImage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const src = safePublicUrl(input.src, true);
  const width = Number(input.width);
  const height = Number(input.height);
  const alt = cleanContentText(input.alt) || fallbackAlt;
  if (!src || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || !alt) {
    return undefined;
  }

  const focalPosition = cleanContentText(input.focalPosition);
  return { src, width, height, alt, ...(focalPosition ? { focalPosition } : {}) };
}

export function normalizePerson(value: unknown): PersonProfile {
  if (!value || typeof value !== "object") throw new ContentValidationError("Person record must be an object.");
  const input = value as Record<string, unknown>;
  const name = cleanContentText(input.name);
  const profileUrl = safePublicUrl(input.profileUrl, false);
  if (!name) throw new ContentValidationError("Person name is required.");
  if (!profileUrl) throw new ContentValidationError(`Person ${name} has an invalid profile URL.`);
  if (!input.member && !input.contributor) throw new ContentValidationError(`Person ${name} must be a member or contributor.`);

  return {
    name,
    profileUrl,
    avatar: normalizeSiteImage(input.avatar, name),
    member: input.member === true,
    contributor: input.contributor === true,
    active: input.active === true,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : Number.MAX_SAFE_INTEGER,
  };
}

export function normalizeSponsor(value: unknown, now = new Date()): SponsorProfile | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.kind !== "sponsor" || input.active !== true) return null;
  const name = cleanContentText(input.name);
  const url = safePublicUrl(input.url, false);
  const recognitionText = cleanContentText(input.recognitionText);
  if (!name || !url || !recognitionText) return null;

  const startsAt = cleanContentText(input.startsAt);
  const endsAt = cleanContentText(input.endsAt);
  const startsTime = startsAt ? Date.parse(startsAt) : Number.NEGATIVE_INFINITY;
  const endsTime = endsAt ? Date.parse(endsAt) : Number.POSITIVE_INFINITY;
  if ((startsAt && Number.isNaN(startsTime)) || (endsAt && Number.isNaN(endsTime)) || startsTime > endsTime) return null;
  if (now.getTime() < startsTime || now.getTime() > endsTime) return null;

  return {
    name,
    url,
    logo: normalizeSiteImage(input.logo, name),
    recognitionText,
    featured: input.featured === true,
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
  };
}

export function normalizeSiteSettings(value: unknown): SiteSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const socialLinks = Array.isArray(input.socialLinks)
    ? input.socialLinks.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        const label = cleanContentText(item.label);
        const url = safePublicUrl(item.url, false);
        return label && url ? [{ label, url }] : [];
      })
    : [];

  return {
    defaultSeoTitle: cleanContentText(input.defaultSeoTitle) || "ZenithBuild",
    defaultSeoDescription: cleanContentText(input.defaultSeoDescription) || "Zenith is a compiler-first UI framework.",
    siteUrl: safePublicUrl(input.siteUrl, false) || "",
    socialImage: normalizeSiteImage(input.socialImage, "ZenithBuild"),
    socialLinks,
    contactUrl: safePublicUrl(input.contactUrl, true) || undefined,
  };
}

export function assertUniqueSlugs(records: Array<{ slug: string }>, label: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.slug)) throw new ContentValidationError(`Duplicate ${label} slug: ${record.slug}`);
    seen.add(record.slug);
  }
}
