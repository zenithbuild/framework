export class ReadableSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadableSlugError";
  }
}

export function normalizeReadableSlug(value: unknown): string {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function requireReadableSlug(value: unknown, label = "slug"): string {
  const slug = normalizeReadableSlug(value);
  if (!slug) throw new ReadableSlugError(`${label} does not produce a readable slug`);
  return slug;
}

export function normalizeReadablePath(value: unknown, label = "path"): string {
  const rawSegments = String(value || "").split("/").filter(Boolean);
  if (rawSegments.length === 0) throw new ReadableSlugError(`${label} has no readable segments`);
  return rawSegments.map((segment, index) => requireReadableSlug(segment, `${label} segment ${index + 1}`)).join("/");
}

export function assertUniqueReadablePaths<T>(
  records: readonly T[],
  pathFor: (record: T) => string,
  label: string,
): void {
  const owners = new Map<string, number>();
  records.forEach((record, index) => {
    const path = pathFor(record);
    const owner = owners.get(path);
    if (owner !== undefined) {
      throw new ReadableSlugError(`Duplicate ${label} path '${path}' at records ${owner + 1} and ${index + 1}`);
    }
    owners.set(path, index);
  });
}
