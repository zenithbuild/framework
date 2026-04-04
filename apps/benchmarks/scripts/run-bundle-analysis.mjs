import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import vm from "node:vm";
import { runtimeModuleProfileSnapshot } from "../../../packages/runtime/dist/template.js";
import { 
  loadMatrixConfig, 
  loadFrameworksConfig, 
  getFrameworkConfig, 
  resolveFixtureDir 
} from "./lib/config.mjs";
import { createRunId, ensureRunPaths, writeJson } from "./lib/results.mjs";

const RUNTIME_PROFILE_PRODUCTION_EMITTED = "production-emitted";
const RUNTIME_PROFILE_PRODUCTION_EMITTED_WITH_PRESENCE = "production-emitted-with-presence";

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    const prefixMatch = process.argv.find(arg => arg.startsWith(`${name}=`));
    if (prefixMatch) {
      return prefixMatch.split("=")[1];
    }
    return "";
  }
  return process.argv[index + 1] || "";
}

function findRuntimeChunk(stats) {
  return (stats.files || []).find((entry) => {
    if (!entry || entry.ext !== ".js") return false;
    return /^assets\/runtime\.[^/]+\.js$/i.test(entry.path);
  }) || null;
}

function findRouterChunk(stats) {
  return (stats.files || []).find((entry) => {
    if (!entry || entry.ext !== ".js") return false;
    return /^assets\/router\.[^/]+\.js$/i.test(entry.path);
  }) || null;
}

function findCoreChunk(stats) {
  return (stats.files || []).find((entry) => {
    if (!entry || entry.ext !== ".js") return false;
    return /^assets\/core\.[^/]+\.js$/i.test(entry.path);
  }) || null;
}

function normalizeAssetPath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) return "";
  const withoutQuery = value.split("?")[0].split("#")[0];
  const withoutLeading = withoutQuery.replace(/^\/+/, "");
  const assetsIndex = withoutLeading.indexOf("assets/");
  if (assetsIndex === -1) {
    return withoutLeading;
  }
  return withoutLeading.slice(assetsIndex);
}

function findChunkByPath(stats, rawPath) {
  const target = normalizeAssetPath(rawPath);
  if (!target) return null;
  return (stats.files || []).find((entry) => entry?.path === target) || null;
}

function detectRuntimeProfile(runtimeSource) {
  const source = String(runtimeSource || "");
  if (source.includes("zenPresence") || source.includes(" presence = zenPresence")) {
    return RUNTIME_PROFILE_PRODUCTION_EMITTED_WITH_PRESENCE;
  }
  return RUNTIME_PROFILE_PRODUCTION_EMITTED;
}

async function readZenithRuntimeContributorData(frameworkId, distDir, runtimeChunk) {
  if (frameworkId !== "zenith" || !runtimeChunk?.path) {
    return {
      runtimeProfile: null,
      runtimeContributors: [],
      runtimeCoverageBytes: 0
    };
  }

  let runtimeSource = "";
  try {
    runtimeSource = await readFile(join(distDir, runtimeChunk.path), "utf8");
  } catch {
    runtimeSource = "";
  }

  const runtimeProfile = detectRuntimeProfile(runtimeSource);
  const runtimeProfileSnapshot = runtimeModuleProfileSnapshot(runtimeProfile);

  return {
    runtimeProfile,
    runtimeContributors: Array.isArray(runtimeProfileSnapshot.contributors)
      ? runtimeProfileSnapshot.contributors.map((entry) => ({
        id: String(entry?.id || ""),
        sourceFile: String(entry?.sourceFile || ""),
        bytes: Number.isFinite(entry?.bytes) ? Number(entry.bytes) : 0
      }))
      : [],
    runtimeCoverageBytes: Number.isFinite(runtimeProfileSnapshot.coverageBytes)
      ? Number(runtimeProfileSnapshot.coverageBytes)
      : 0
  };
}

async function readJsonFile(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readTextFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

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

function summarizeRouterContributors(source, routerChunkBytes) {
  const contributors = rankTopFunctions(source, { limit: 16, idPrefix: "router-fn" });
  const coverageBytes = contributors.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0);
  return {
    contributors,
    coverageBytes,
    chunkBytes: Number(routerChunkBytes) || 0
  };
}

function summarizePageContributors(source, pageChunkBytes) {
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

async function getDirectoryStats(dirPath) {
  const stats = {
    totalJsSize: 0,
    totalCssSize: 0,
    totalAssetSize: 0,
    jsCount: 0,
    cssCount: 0,
    assetCount: 0,
    files: []
  };

  async function walk(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const s = await stat(fullPath);
        const ext = extname(entry.name).toLowerCase();
        const relPath = join(currentPath.replace(dirPath, ""), entry.name).replace(/^\//, "");
        
        stats.files.push({ path: relPath, size: s.size, ext });

        if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
          stats.totalJsSize += s.size;
          stats.jsCount++;
        } else if (ext === ".css") {
          stats.totalCssSize += s.size;
          stats.cssCount++;
        } else {
          stats.totalAssetSize += s.size;
          stats.assetCount++;
        }
      }
    }
  }

  await walk(dirPath);
  return stats;
}

async function extractAssetReferences(htmlPath) {
  let content;
  try {
    content = await readFile(htmlPath, "utf8");
  } catch (e) {
    return { scripts: [], links: [], inlineScriptCount: 0, inlineScriptBytes: 0 };
  }
  
  const scriptSources = [...content.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gm)].map(m => m[1]);
  const inlineScripts = [...content.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gm)]
    .map((match) => String(match[1] || ""));
    
  const links = [...content.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gm)].map(m => m[1]);
  const inlineScriptBytes = inlineScripts.reduce((sum, script) => sum + Buffer.byteLength(script, "utf8"), 0);
  
  return { 
    scripts: scriptSources, 
    inlineScriptCount: inlineScripts.length,
    inlineScriptBytes,
    links 
  };
}

async function runBundleAnalysis(caseConfig, frameworkId, options = {}) {
  const frameworksConfig = await loadFrameworksConfig();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const fixtureDir = resolveFixtureDir(caseConfig, frameworkConfig);
  
  const artifactSubdir = frameworkConfig.buildArtifacts?.[0] || "dist";
  const distDir = join(fixtureDir, artifactSubdir);

  console.log(`\n[Bundle Analysis] Checking ${caseConfig.id} (${frameworkId})...`);
  
  const stats = await getDirectoryStats(distDir);
  const assetRefs = await extractAssetReferences(join(distDir, "index.html"));
  const runtimeChunk = findRuntimeChunk(stats);
  const routerChunk = findRouterChunk(stats);
  const coreChunk = findCoreChunk(stats);
  const runtimeChunkBytes = runtimeChunk?.size ?? 0;
  const routerChunkBytes = routerChunk?.size ?? 0;
  const coreChunkBytes = coreChunk?.size ?? 0;
  const runtimeContributorData = await readZenithRuntimeContributorData(frameworkId, distDir, runtimeChunk);
  const zenithManifest = frameworkId === "zenith"
    ? await readJsonFile(join(distDir, "manifest.json"))
    : null;

  const chunkEntries = zenithManifest && typeof zenithManifest === "object" && zenithManifest.chunks && typeof zenithManifest.chunks === "object"
    ? Object.entries(zenithManifest.chunks)
    : [];
  const pageChunkCandidates = chunkEntries
    .map(([, rawPath]) => findChunkByPath(stats, rawPath))
    .filter(Boolean);
  const pageChunk = pageChunkCandidates.sort((left, right) => right.size - left.size)[0] || null;
  const pageChunkBytes = pageChunk?.size ?? 0;

  const routerSource = routerChunk?.path ? await readTextFile(join(distDir, routerChunk.path)) : "";
  const pageSource = pageChunk?.path ? await readTextFile(join(distDir, pageChunk.path)) : "";
  const routerContributorData = summarizeRouterContributors(routerSource, routerChunkBytes);
  const pageContributorData = summarizePageContributors(pageSource, pageChunkBytes);

  console.log(`  Target: index.html`);
  console.log(`  Referenced Scripts: ${assetRefs.scripts.length > 0 ? assetRefs.scripts.join(", ") : "none"}`);
  console.log(`  Referenced Styles: ${assetRefs.links.length > 0 ? assetRefs.links.join(", ") : "none"}`);
  console.log(`  Inline Scripts: ${assetRefs.inlineScriptCount} (${assetRefs.inlineScriptBytes} B)`);
  console.log(`  Runtime Chunk: ${runtimeChunk ? `${runtimeChunk.path} (${runtimeChunkBytes} B)` : "none"}`);
  console.log(`  Router Chunk: ${routerChunk ? `${routerChunk.path} (${routerChunkBytes} B)` : "none"}`);
  console.log(`  Page Chunk: ${pageChunk ? `${pageChunk.path} (${pageChunkBytes} B)` : "none"}`);
  console.log(`  Core Chunk: ${coreChunk ? `${coreChunk.path} (${coreChunkBytes} B)` : "none"}`);
  
  console.log(`  Total JS Emitted: ${(stats.totalJsSize / 1024).toFixed(2)} KB (${stats.jsCount} files)`);
  console.log(`  Total CSS Emitted: ${(stats.totalCssSize / 1024).toFixed(2)} KB (${stats.cssCount} files)`);
  console.log(`  Total JS + Inline: ${((stats.totalJsSize + assetRefs.inlineScriptBytes) / 1024).toFixed(2)} KB`);
  if (frameworkId === "zenith") {
    const tableBytes = Number(pageContributorData.tableCoverageBytes) || 0;
    const sourceOverhead = pageContributorData.sourceOverhead || {};
    console.log(`  Page Table Coverage: ${tableBytes} B`);
    console.log(
      `  Source Overhead: canonical file fields ${Number(sourceOverhead.canonicalFileFieldOverheadBytes) || 0} B, canonical file values ${Number(sourceOverhead.canonicalFileValueBytes) || 0} B, compact file table values ${Number(sourceOverhead.compactFileTableLiteralBytes) || 0} B`
    );
  }

  let success = true;
  if (caseConfig.id === "static-marketing" && frameworkId === "zenith") {
    const isZeroJs = assetRefs.scripts.length === 0 && assetRefs.inlineScriptCount === 0;
    
    if (!isZeroJs) {
      console.error(`[FAILED] Zero-JS check failed for Zenith static-marketing index.html`);
      success = false;
    }
    
    if (stats.jsCount > 0) {
       console.error(`[FAILED] Static route emitted ${stats.jsCount} JS files unexpectedly.`);
       success = false;
    }
    
    if (success) {
      console.log(`[PASSED] Zero-JS check verified.`);
    }
  }

  return {
    status: success ? "passed" : "failed",
    stats,
    assetRefs,
    runtimeChunkBytes,
    routerChunkBytes,
    pageChunkBytes,
    coreChunkBytes,
    runtimeProfile: runtimeContributorData.runtimeProfile,
    runtimeContributors: runtimeContributorData.runtimeContributors,
    runtimeCoverageBytes: runtimeContributorData.runtimeCoverageBytes,
    routerContributors: routerContributorData.contributors,
    routerCoverageBytes: routerContributorData.coverageBytes,
    pageContributors: pageContributorData.contributors,
    pageCoverageBytes: pageContributorData.coverageBytes,
    pageTableContributors: pageContributorData.tableContributors,
    pageTableCoverageBytes: pageContributorData.tableCoverageBytes,
    pageSourceOverhead: pageContributorData.sourceOverhead,
    comparabilityNotes: [
      "totalJsSize counts emitted JS asset files under the build artifact directory",
      "inlineScriptBytes counts inline script bytes in index.html",
      "use totalJsSize + inlineScriptBytes for mixed inline/external script comparisons",
      "runtimeContributors/runtimeCoverageBytes are Zenith runtime-template contributor metrics",
      "routerContributors/pageContributors are emitted-asset contributor estimates from built chunks",
      "pageTableContributors/pageSourceOverhead track page payload table shape and repeated source-span/file overhead"
    ],
    totalJsPlusInlineBytes: stats.totalJsSize + assetRefs.inlineScriptBytes
  };
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseIdFilter = readFlag("--case");
  const requestedRunId = readFlag("--run-id");
  const profile = readFlag("--profile") || "fast";
  const resultsQuality = profile === "publication" ? "publishable" : "fast_non_publishable";

  const matrixConfig = await loadMatrixConfig();
  const selectedCases = caseIdFilter 
    ? matrixConfig.cases.filter(c => c.id === caseIdFilter)
    : matrixConfig.cases.filter(c => c.frameworkIds.includes(frameworkId));

  if (selectedCases.length === 0) {
    console.error("No matching cases found.");
    process.exit(1);
  }

  const runId = requestedRunId || createRunId("bundle-analysis");
  const { runDir } = await ensureRunPaths(runId, "bundle-analysis");

  const results = [];
  let failedCount = 0;

  for (const caseConfig of selectedCases) {
    const result = await runBundleAnalysis(caseConfig, frameworkId, { profile });
    results.push({
      caseId: caseConfig.id,
      frameworkId,
      track: "bundle-analysis",
      benchmark_profile: profile,
      results_quality: resultsQuality,
      ...result
    });
    if (result.status !== "passed") failedCount++;
  }

  const output = {
    schemaVersion: 1,
    runner: "bundle-analysis",
    runId,
    benchmark_profile: profile,
    results_quality: resultsQuality,
    generatedAt: new Date().toISOString(),
    results
  };

  await writeJson(join(runDir, "bundle-analysis.json"), output);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
