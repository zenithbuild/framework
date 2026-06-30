import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { runtimeModuleProfileSnapshot } from "../../../packages/runtime/dist/template.js";
import { 
  loadMatrixConfig, 
  loadFrameworksConfig, 
  getFrameworkConfig, 
  resolveFixtureDir 
} from "./lib/config.mjs";
import { createRunId, ensureRunPaths, writeJson } from "./lib/results.mjs";
import { summarizePageContributors, summarizeRouterContributors } from "./lib/source-contributors.mjs";

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
