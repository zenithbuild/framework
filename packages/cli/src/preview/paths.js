import { access } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';

export function toStaticFilePath(distDir, pathname) {
  let resolved = pathname;
  if (resolved === '/') {
    resolved = '/index.html';
  } else if (!extname(resolved)) {
    resolved += '/index.html';
  }
  return resolveWithinDist(distDir, resolved);
}

export function resolveWithinDist(distDir, requestPath) {
  let decoded = requestPath;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const normalized = normalize(decoded).replace(/\\/g, '/');
  const relative = normalized.replace(/^\/+/, '');
  const root = resolve(distDir);
  const candidate = resolve(root, relative);
  if (candidate === root || candidate.startsWith(`${root}${sep}`)) {
    return candidate;
  }
  return null;
}

export async function fileExists(fullPath) {
  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}
