import vm from "node:vm";

// Source contributor analysis helpers extracted from run-bundle-analysis.mjs.
// Pure helpers for ranking emitted-asset contributors and page payload overhead.

function rankTopFunctions(source, { limit = 12, idPrefix = "fn" } = {}) {
  const text = String(source || "");
  const matches = [...text.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)];
  if (matches.length === 0) return [];

  const ranked = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const name = String(match[1] || "").trim();
    if (!name) continue;
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const bytes = Buffer.byteLength(text.slice(start, end), "utf8");
    ranked.push({ id: `${idPrefix}:${name}`, bytes });
  }

  return ranked
    .sort((left, right) => right.bytes - left.bytes || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function estimateConstBytes(source, identifier) {
  const pattern = new RegExp(`const\\s+${identifier}\\s*=\\s*[\\s\\S]*?;`, "m");
  const found = pattern.exec(String(source || ""));
  if (!found) return 0;
  return Buffer.byteLength(found[0], "utf8");
}

function extractConstInitializer(source, identifier) {
  const text = String(source || "");
  const pattern = new RegExp(`\\bconst\\s+${identifier}\\s*=`, "g");
  const match = pattern.exec(text);
  if (!match) return "";

  let index = match.index + match[0].length;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }

  let quote = "";
  let escaped = false;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;

  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "/" && text[cursor + 1] === "/") {
      const nextLine = text.indexOf("\n", cursor + 2);
      if (nextLine === -1) break;
      cursor = nextLine;
      continue;
    }

    if (char === "/" && text[cursor + 1] === "*") {
      const blockEnd = text.indexOf("*/", cursor + 2);
      if (blockEnd === -1) break;
      cursor = blockEnd + 1;
      continue;
    }

    if (char === "(") depthParen += 1;
    else if (char === ")") depthParen = Math.max(0, depthParen - 1);
    else if (char === "{") depthBrace += 1;
    else if (char === "}") depthBrace = Math.max(0, depthBrace - 1);
    else if (char === "[") depthBracket += 1;
    else if (char === "]") depthBracket = Math.max(0, depthBracket - 1);
    else if (char === ";" && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      return text.slice(index, cursor).trim();
    }
  }

  return "";
}

function parseJsonConst(source, identifier) {
  const initializer = extractConstInitializer(source, identifier);
  if (!initializer) return null;
  const first = initializer[0];
  if (first !== "[" && first !== "{") return null;
  try {
    return JSON.parse(initializer);
  } catch {
    try {
      return vm.runInNewContext(`(${initializer})`, Object.create(null), { timeout: 50 });
    } catch {
      return null;
    }
  }
}

function summarizePageSourceOverhead(source) {
  const text = String(source || "");
  const fileFieldMatches = text.match(/"file":/g) || [];
  const fileValueMatches = [...text.matchAll(/"file":"((?:\\.|[^"\\])*)"/g)];
  const sourceObjectMatches = text.match(/"source":\{"file":/g) || [];
  const compactFiles = parseJsonConst(text, "__zenith_payload_files");
  const compactExpressionRows = parseJsonConst(text, "__zenith_payload_expression_rows");
  const compactMarkerRows = parseJsonConst(text, "__zenith_payload_marker_rows");

  const fileFieldTokenBytes = Buffer.byteLength("\"file\":", "utf8");
  const fileValueBytes = fileValueMatches.reduce((sum, match) => {
    const token = `"${String(match[1] || "")}"`;
    return sum + Buffer.byteLength(token, "utf8");
  }, 0);
  const compactFileTableLiteralBytes = Array.isArray(compactFiles)
    ? compactFiles.reduce((sum, entry) => {
      const value = JSON.stringify(String(entry ?? ""));
      return sum + Buffer.byteLength(value, "utf8");
    }, 0)
    : 0;

  let compactSourceTupleCount = 0;
  if (Array.isArray(compactExpressionRows)) {
    for (const row of compactExpressionRows) {
      if (Array.isArray(row) && Array.isArray(row[2]) && row[2].length >= 5) {
        compactSourceTupleCount += 1;
      }
    }
  }
  if (Array.isArray(compactMarkerRows)) {
    for (const row of compactMarkerRows) {
      if (Array.isArray(row) && Array.isArray(row[3]) && row[3].length >= 5) {
        compactSourceTupleCount += 1;
      }
    }
  }

  return {
    canonicalSourceFieldCount: sourceObjectMatches.length,
    canonicalSourceFieldOverheadBytes: sourceObjectMatches.length * Buffer.byteLength("\"source\":", "utf8"),
    canonicalFileFieldCount: fileFieldMatches.length,
    canonicalFileFieldOverheadBytes: fileFieldMatches.length * fileFieldTokenBytes,
    canonicalFileValueCount: fileValueMatches.length,
    canonicalFileValueBytes: fileValueBytes,
    canonicalUniqueFiles: new Set(fileValueMatches.map((match) => String(match[1] || ""))).size,
    compactFileTableCount: Array.isArray(compactFiles) ? compactFiles.length : 0,
    compactFileTableLiteralBytes,
    compactSourceTupleCount
  };
}

export function summarizeRouterContributors(source, routerChunkBytes) {
  const contributors = rankTopFunctions(source, { limit: 16, idPrefix: "router-fn" });
  const coverageBytes = contributors.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0);
  return {
    contributors,
    coverageBytes,
    chunkBytes: Number(routerChunkBytes) || 0
  };
}

export function summarizePageContributors(source, pageChunkBytes) {
  const text = String(source || "");
  const sectionNames = [
    "__zenith_expression_bindings",
    "__zenith_expr_fns",
    "__zenith_markers",
    "__zenith_payload_expression_rows",
    "__zenith_payload_marker_rows",
    "__zenith_payload_files",
    "__zenith_html",
    "__zenith_events",
    "__zenith_state_values",
    "__zenith_state_keys",
    "__zenith_signals"
  ];

  const sectionContributors = sectionNames
    .map((name) => ({ id: `page-section:${name}`, bytes: estimateConstBytes(text, name) }))
    .filter((entry) => entry.bytes > 0);
  const functionContributors = rankTopFunctions(text, { limit: 10, idPrefix: "page-fn" });

  const generatedIds = text.match(/\b__[A-Za-z0-9_]*_zenith_src_[A-Za-z0-9_]*_script[0-9]+_[A-Za-z0-9_]+\b/g) || [];
  const generatedIdBytes = generatedIds.reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);
  const tableNames = [
    "__zenith_expression_bindings",
    "__zenith_markers",
    "__zenith_payload_expression_rows",
    "__zenith_payload_marker_rows",
    "__zenith_payload_files"
  ];
  const tableContributors = tableNames
    .map((name) => ({ id: `page-table:${name}`, bytes: estimateConstBytes(text, name) }))
    .filter((entry) => entry.bytes > 0);
  const sourceOverhead = summarizePageSourceOverhead(text);
  const sourceOverheadContributors = [
    {
      id: "page-source-overhead:canonical-file-fields",
      bytes: Number(sourceOverhead.canonicalFileFieldOverheadBytes) || 0
    },
    {
      id: "page-source-overhead:canonical-file-values",
      bytes: Number(sourceOverhead.canonicalFileValueBytes) || 0
    },
    {
      id: "page-source-overhead:compact-file-table-values",
      bytes: Number(sourceOverhead.compactFileTableLiteralBytes) || 0
    }
  ].filter((entry) => entry.bytes > 0);

  const contributors = [
    ...sectionContributors,
    ...functionContributors,
    ...tableContributors,
    ...sourceOverheadContributors
  ];
  if (generatedIdBytes > 0) {
    contributors.push({
      id: "page-generated-scoped-identifiers",
      bytes: generatedIdBytes,
      count: generatedIds.length,
      unique: new Set(generatedIds).size
    });
  }

  const ranked = contributors
    .sort((left, right) => (Number(right.bytes) || 0) - (Number(left.bytes) || 0) || String(left.id).localeCompare(String(right.id)))
    .slice(0, 20);
  const coverageBytes = ranked.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0);
  return {
    contributors: ranked,
    coverageBytes,
    chunkBytes: Number(pageChunkBytes) || 0,
    tableContributors: tableContributors
      .sort((left, right) => (Number(right.bytes) || 0) - (Number(left.bytes) || 0) || String(left.id).localeCompare(String(right.id))),
    tableCoverageBytes: tableContributors.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0),
    sourceOverhead
  };
}
