import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function normalizeRelPath(p) {
  return p.split(path.sep).join('/');
}

export async function walkFilesDeterministic(rootDir) {
  const out = [];

  async function walk(current, relBase) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const rel = relBase ? path.join(relBase, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        out.push(normalizeRelPath(rel));
      }
    }
  }

  if (!fs.existsSync(rootDir)) {
    return out;
  }

  await walk(rootDir, '');
  return out;
}

export async function sha256File(filePath) {
  const buf = await fsp.readFile(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(buf);
  return hash.digest('hex');
}

export async function hashTree(rootDir) {
  const files = await walkFilesDeterministic(rootDir);
  const pairs = [];

  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const hash = await sha256File(abs);
    pairs.push([rel, hash]);
  }

  return pairs;
}

export function diffHashPairs(aPairs, bPairs) {
  const a = new Map(aPairs);
  const b = new Map(bPairs);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const diffs = [];

  for (const key of keys) {
    const av = a.get(key);
    const bv = b.get(key);
    if (av !== bv) {
      diffs.push({ file: key, a: av || null, b: bv || null });
    }
  }

  return diffs;
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, content, 'utf8');
}

export async function copyDir(src, dst) {
  const files = await walkFilesDeterministic(src);
  for (const rel of files) {
    const from = path.join(src, rel);
    const to = path.join(dst, rel);
    await ensureDir(path.dirname(to));
    await fsp.copyFile(from, to);
  }
}
