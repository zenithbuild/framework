import fs from 'node:fs/promises';
import path from 'node:path';
import { walkFilesDeterministic } from './fs.js';

export async function scanSources(dir, patterns, fileExts = ['.js', '.ts', '.rs']) {
  const files = await walkFilesDeterministic(dir);
  const hits = [];

  for (const rel of files) {
    const ext = path.extname(rel);
    if (!fileExts.includes(ext)) {
      continue;
    }
    const abs = path.join(dir, rel);
    const source = await fs.readFile(abs, 'utf8');

    for (const pattern of patterns) {
      if (pattern.test(source)) {
        hits.push({ file: abs, pattern: pattern.toString() });
      }
    }
  }

  return hits;
}

export function stripCommentsAndStrings(source) {
  // Lightweight stripper to reduce false positives in static forbidden-pattern scans.
  // This is not a full parser, but it is deterministic and sufficient for guardrails.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/`(?:\\.|[^\\`])*`/g, '``')
    .replace(/'(?:\\.|[^\\'])*'/g, "''")
    .replace(/"(?:\\.|[^\\"])*"/g, '""');
}
