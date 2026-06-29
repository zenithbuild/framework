function stripComment(rawLine) {
  let quote = null;
  for (let i = 0; i < rawLine.length; i += 1) {
    const ch = rawLine[i];
    if (quote) {
      if (ch === quote && rawLine[i - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "#") {
      return rawLine.slice(0, i);
    }
  }
  return rawLine;
}

function parseScalar(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value);
    } catch {
      const inner = value.slice(1, -1).trim();
      if (!inner) {
        return [];
      }
      return inner.split(",").map((token) => parseScalar(token.trim()));
    }
  }
  return value;
}

export function parseStructuredBlock(content) {
  const data = {};
  let currentKey = null;

  for (const rawLine of content.split("\n")) {
    const withoutComments = stripComment(rawLine).replace(/\t/g, "  ").replace(/\r$/, "");
    if (!withoutComments.trim()) {
      continue;
    }

    const indent = (withoutComments.match(/^ */) || [""])[0].length;
    const line = withoutComments.trim();

    if (indent > 0 && currentKey) {
      if (line.startsWith("- ")) {
        if (!Array.isArray(data[currentKey])) {
          data[currentKey] = [];
        }
        data[currentKey].push(parseScalar(line.slice(2)));
        continue;
      }

      const nestedIdx = line.indexOf(":");
      if (nestedIdx <= 0) {
        continue;
      }

      const nestedKey = line.slice(0, nestedIdx).trim();
      const nestedValueRaw = line.slice(nestedIdx + 1).trim();
      if (!data[currentKey] || typeof data[currentKey] !== "object" || Array.isArray(data[currentKey])) {
        data[currentKey] = {};
      }
      data[currentKey][nestedKey] = nestedValueRaw ? parseScalar(nestedValueRaw) : "";
      continue;
    }

    const idx = line.indexOf(":");
    if (idx <= 0) {
      currentKey = null;
      continue;
    }

    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 1).trim();
    if (!valueRaw) {
      data[key] = {};
      currentKey = key;
      continue;
    }
    data[key] = parseScalar(valueRaw);
    currentKey = null;
  }

  return data;
}

export function parseFrontmatter(content, filePath, requiredKeys) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error(`Missing frontmatter: ${filePath}`);
  }

  const meta = parseStructuredBlock(match[1]);

  for (const key of requiredKeys) {
    if (!(key in meta)) {
      throw new Error(`Missing required frontmatter key '${key}': ${filePath}`);
    }
  }

  if (!Array.isArray(meta.tags)) {
    throw new Error(`Frontmatter 'tags' must be an array: ${filePath}`);
  }

  return { meta, body: content.slice(match[0].length) };
}
