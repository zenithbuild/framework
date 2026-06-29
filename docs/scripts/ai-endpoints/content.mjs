import fs from "node:fs/promises";
import path from "node:path";

const MAX_ORDER = 999999;

export async function listContentFiles(rootDir, options = {}) {
  const out = [];
  const excludedDirs = new Set(options.excludeDirectories || []);

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name)) {
          continue;
        }
        await walk(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!/\.(md|mdx)$/i.test(entry.name)) {
        continue;
      }
      out.push(full);
    }
  }

  try {
    await walk(rootDir);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export async function listDirectories(rootDir) {
  const dirs = [];

  async function walk(dir) {
    dirs.push(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await walk(path.join(dir, entry.name));
    }
  }

  try {
    await walk(rootDir);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  dirs.sort((a, b) => a.localeCompare(b));
  return dirs;
}

export function slugFromPath(fullPath, rootDir) {
  const rel = path.relative(rootDir, fullPath).replace(/\\/g, "/");
  return rel.replace(/\.(md|mdx)$/i, "");
}

export function stripDatePrefix(slug) {
  const match = String(slug || "").match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  if (!match) {
    return String(slug || "");
  }
  return match[1];
}

export function stripNumericPrefix(name) {
  const match = String(name || "").match(/^(\d+)[-_](.+)$/);
  if (!match) {
    return { name: String(name || ""), orderHint: null };
  }
  return { name: match[2], orderHint: Number.parseInt(match[1], 10) };
}

export function titleCaseFromSlug(raw) {
  return String(raw || "")
    .replace(/[-_]/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Number.parseFloat(value.trim());
  }
  return null;
}

export function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function asArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return [];
}

export function rankOrder(value) {
  const num = asNumber(value);
  return num === null ? MAX_ORDER : num;
}

export function compareNumber(a, b) {
  return rankOrder(a) - rankOrder(b);
}

export function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

export function resolveDocOrder(meta, fileStem) {
  if (meta && typeof meta === "object") {
    const nav = meta.nav && typeof meta.nav === "object" ? meta.nav : null;
    const candidates = [nav ? nav.order : null, meta.nav_order, meta.order];
    for (const candidate of candidates) {
      const value = asNumber(candidate);
      if (value !== null) {
        return value;
      }
    }
  }

  const prefixed = stripNumericPrefix(fileStem);
  return prefixed.orderHint;
}

export function resolveHidden(meta) {
  const nav = meta && typeof meta.nav === "object" ? meta.nav : null;
  const hiddenRaw = nav ? nav.hidden : meta?.nav_hidden;
  if (typeof hiddenRaw === "boolean") {
    return hiddenRaw;
  }
  if (typeof hiddenRaw === "string") {
    return hiddenRaw.trim().toLowerCase() === "true";
  }
  return false;
}

export function resolveLevel(meta) {
  const level = asNumber(meta?.level);
  if (level !== null) {
    return level;
  }
  const value = asString(meta?.level).toLowerCase();
  if (value === "beginner") {
    return 0;
  }
  if (value === "intermediate") {
    return 1;
  }
  if (value === "advanced") {
    return 2;
  }
  return null;
}

export function relativePosixPath(fullPath, rootDir) {
  return path.relative(rootDir, fullPath).replace(/\\/g, "/");
}

export function docsCategoryLookup(categoryMap, relPath) {
  const entry = categoryMap.get(relPath);
  if (entry) {
    return entry;
  }
  const segment = relPath.split("/").slice(-1)[0] || relPath;
  const stripped = stripNumericPrefix(segment);
  return {
    path: relPath,
    slug: stripped.name,
    title: titleCaseFromSlug(stripped.name),
    summary: "",
    order: stripped.orderHint,
  };
}
