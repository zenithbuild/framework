import crypto from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { 
  loadMatrixConfig, 
  loadFrameworksConfig, 
  getFrameworkConfig, 
  resolveFixtureDir 
} from "./lib/config.mjs";
import { runCommand } from "./lib/process.mjs";
import { 
  ensureBaselinePath, 
  readJson, 
  writeJson,
  createRunId,
  ensureRunPaths
} from "./lib/results.mjs";

const NPM_PATH = "/opt/homebrew/bin/npm";

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

async function getFileHash(filePath) {
  const content = await readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function normalizePath(relPath) {
  // Common hash pattern: .[hash].js or -[hash].js
  // Zenith specifically seems to use .[8-character-hex].js
  return relPath.replace(/\.[a-f0-9]{8,64}(\.[a-z0-9]+)$/i, '$1');
}

async function getDirectoryManifest(dirPath) {
  const manifest = new Map();
  
  async function walk(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch (e) {
      // If directory doesn't exist, return empty manifest
      return;
    }

    // Sort entries to ensure deterministic walk order
    entries.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = relative(dirPath, fullPath);
        const hash = await getFileHash(fullPath);
        
        // Use normalized path as key if requested, to ignore hash changes in filenames
        const key = process.argv.includes("--ignore-filename-hashes") 
          ? normalizePath(relPath) 
          : relPath;
          
        manifest.set(key, hash);
      }
    }
  }

  await walk(dirPath);
  return manifest;
}

function compareManifests(m1, m2, label1, label2) {
  const diffs = [];
  const keys1 = Array.from(m1.keys()).sort();
  const keys2 = Array.from(m2.keys()).sort();

  // Check for missing/extra files
  const allKeys = new Set([...keys1, ...keys2]);
  for (const key of allKeys) {
    if (!m1.has(key)) {
      diffs.push(`File "${key}" present in ${label2} but missing in ${label1}`);
    } else if (!m2.has(key)) {
      diffs.push(`File "${key}" present in ${label1} but missing in ${label2}`);
    } else if (m1.get(key) !== m2.get(key)) {
      diffs.push(`File "${key}" hash mismatch:
  ${label1}: ${m1.get(key)}
  ${label2}: ${m2.get(key)}`);
    }
  }

  return diffs;
}

async function runDeterminismCheck(caseConfig, frameworkId, options = {}) {
  const frameworksConfig = await loadFrameworksConfig();
  const frameworkConfig = getFrameworkConfig(frameworksConfig, frameworkId);
  const fixtureDir = resolveFixtureDir(caseConfig, frameworkConfig);
  
  const artifactSubdir = frameworkConfig.buildArtifacts?.[0] || "dist";
  const distDir = join(fixtureDir, artifactSubdir);

  console.log(`\n[Determinism] Checking ${caseConfig.id} (${frameworkId}) [Profile: ${options.profile}]...`);
  
  const manifests = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`  Build ${i}/3...`);
    
    const commandArray = frameworkConfig.commands?.build || ["npm", "run", "build"];
    let [cmd, ...args] = commandArray;
    
    const buildResult = runCommand(cmd, args, { 
      cwd: fixtureDir,
      env: { ...process.env, ...frameworkConfig.env }
    });
    
    if (buildResult.status !== 0) {
      console.error(`Build ${i} failed:`, buildResult.stderr);
      return { status: "failed", error: "Build failed" };
    }

    const manifest = await getDirectoryManifest(distDir);
    if (manifest.size === 0) {
      console.error(`Build ${i} produced no files in ${distDir}`);
      return { status: "failed", error: "No files produced" };
    }
    manifests.push(manifest);
  }

  const diffs12 = compareManifests(manifests[0], manifests[1], "Build 1", "Build 2");
  const diffs23 = compareManifests(manifests[1], manifests[2], "Build 2", "Build 3");
  const internalDiffs = [...new Set([...diffs12, ...diffs23])];

  // Baseline Comparison
  let baselineDiffs = [];
  const baselineDir = await ensureBaselinePath();
  const baselinePath = join(baselineDir, `${caseConfig.id}__${frameworkId}.json`);
  let baselineLoaded = false;

  try {
    const rawBaseline = await readJson(baselinePath);
    const baselineManifest = new Map(Object.entries(rawBaseline));
    baselineDiffs = compareManifests(baselineManifest, manifests[0], "Baseline", "Current Build");
    baselineLoaded = true;
    console.log(`  Compared against baseline: ${baselinePath}`);
  } catch (e) {
    console.log(`  No baseline found at ${baselinePath}`);
  }

  if (internalDiffs.length > 0) {
    console.error(`\n[FAILED] Internal output drift detected in ${caseConfig.id} (${frameworkId}):`);
    internalDiffs.forEach(diff => console.error(`- ${diff}`));
  }

  if (baselineDiffs.length > 0) {
    console.error(`\n[FAILED] Drift relative to baseline detected in ${caseConfig.id} (${frameworkId}):`);
    baselineDiffs.forEach(diff => console.error(`- ${diff}`));
  }

  const success = internalDiffs.length === 0 && baselineDiffs.length === 0;
  if (success) {
    console.log(`[PASSED] Output is deterministic.`);
  }

  // Save Baseline Logic
  if (options.saveBaseline) {
    if (options.profile !== "publication") {
      console.error(`[ERROR] Refusing to save baseline: Profile must be "publication" (got "${options.profile}").`);
      process.exit(1);
    }
    if (frameworkId !== "zenith") {
      console.error(`[ERROR] Refusing to save baseline: Baseline persistence is Zenith-only in Round 1.`);
      process.exit(1);
    }

    const manifestObj = Object.fromEntries(manifests[0]);
    await writeJson(baselinePath, manifestObj);
    console.log(`[SAVED] New baseline manifest saved to ${baselinePath}`);
  }

  return {
    status: success ? "passed" : "failed",
    internal_drift: internalDiffs,
    baseline_drift: baselineDiffs,
    baseline_loaded: baselineLoaded
  };
}

async function main() {
  const frameworkId = readFlag("--framework") || "zenith";
  const caseIdFilter = readFlag("--case");
  const requestedRunId = readFlag("--run-id");
  const saveBaseline = process.argv.includes("--save-baseline");
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

  const runId = requestedRunId || createRunId("determinism");
  const { runDir } = await ensureRunPaths(runId, "determinism");
  
  const results = [];
  let failedCount = 0;

  for (const caseConfig of selectedCases) {
    const result = await runDeterminismCheck(caseConfig, frameworkId, { saveBaseline, profile });
    results.push({
      caseId: caseConfig.id,
      frameworkId,
      track: "determinism",
      benchmark_profile: profile,
      results_quality: resultsQuality,
      ...result
    });
    if (result.status !== "passed") failedCount++;
  }

  const output = {
    schemaVersion: 1,
    runner: "determinism",
    runId,
    benchmark_profile: profile,
    results_quality: resultsQuality,
    generatedAt: new Date().toISOString(),
    results
  };

  await writeJson(join(runDir, "determinism.json"), output);

  if (failedCount > 0) {
    console.error(`\nDeterminism check failed for ${failedCount} case(s).`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
