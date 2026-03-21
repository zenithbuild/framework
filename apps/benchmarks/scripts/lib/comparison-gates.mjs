import {
  rebuildContractFingerprint,
  resolveRebuildMeasurementContract,
} from "./measurement-contracts.mjs";

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function fingerprintEnvironment(result) {
  const machine = result.environment?.machine || {};
  const runtime = result.environment?.runtime || {};
  return {
    gitCommit: result.environment?.gitCommit || "",
    machine: [
      machine.platform,
      machine.release,
      machine.arch,
      machine.cpuModel,
      machine.cpuCount,
      machine.totalMemoryMb,
    ].join("|"),
    runtime: [runtime.node, runtime.npm, runtime.bun].join("|"),
    samples: `${result.environment?.warmupCount || 0}/${result.environment?.sampleCount || 0}`,
  };
}

function formatCodeList(values) {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "-";
}

function measurementContractsForHydration(results) {
  return uniqueValues(
    results.map((result) => JSON.stringify(
      result.measurementContract
        || result.results.find((entry) => entry.track === "hydration-runtime" && entry.measurementContract)?.measurementContract
        || null,
    )),
  );
}

function rebuildContractsForEntries(entries) {
  const byFramework = new Map();
  for (const entry of entries.filter((candidate) => candidate.track === "rebuild")) {
    if (!byFramework.has(entry.frameworkId)) {
      byFramework.set(entry.frameworkId, {
        frameworkId: entry.frameworkId,
        contract: resolveRebuildMeasurementContract(entry),
      });
    }
  }
  return [...byFramework.values()];
}

function selectedFrameworks(results, filteredEntries) {
  const frameworksFromResults = uniqueValues(
    results.flatMap((result) => (result.results || []).map((entry) => entry.frameworkId)),
  );
  return frameworksFromResults.length > 0
    ? frameworksFromResults
    : uniqueValues(filteredEntries.map((entry) => entry.frameworkId));
}

function selectedTracks(page, filteredEntries) {
  const requestedTracks = uniqueValues(page.trackIds || []);
  return requestedTracks.length > 0
    ? requestedTracks
    : uniqueValues(filteredEntries.map((entry) => entry.track));
}

export function summarizeComparisonContext(page, results) {
  const requestedTracks = uniqueValues(page.trackIds || []);
  const filteredEntries = results
    .flatMap((result) => result.results || [])
    .filter((entry) => requestedTracks.length === 0 || requestedTracks.includes(entry.track));
  const frameworks = selectedFrameworks(results, filteredEntries);
  const tracks = selectedTracks(page, filteredEntries);
  const casesByTrack = new Map();

  for (const trackId of tracks) {
    casesByTrack.set(
      trackId,
      uniqueValues(filteredEntries.filter((entry) => entry.track === trackId).map((entry) => entry.caseId)),
    );
  }

  return {
    requestedTracks,
    filteredEntries,
    frameworks,
    tracks,
    cases: uniqueValues(filteredEntries.map((entry) => entry.caseId)),
    casesByTrack,
  };
}

function buildSparseCellDetails(context) {
  const failures = [];
  const duplicateRows = [];

  for (const trackId of context.tracks) {
    const caseIds = context.casesByTrack.get(trackId) || [];
    for (const caseId of caseIds) {
      const entries = context.filteredEntries.filter((entry) => entry.track === trackId && entry.caseId === caseId);
      const frameworks = uniqueValues(entries.map((entry) => entry.frameworkId));
      if (frameworks.length !== context.frameworks.length) {
        const missing = context.frameworks.filter((frameworkId) => !frameworks.includes(frameworkId));
        failures.push(`${trackId}/${caseId} missing ${missing.join(", ")}`);
      }
      if (entries.length > frameworks.length) {
        duplicateRows.push(`${trackId}/${caseId}`);
      }
    }
  }

  return { failures, duplicateRows };
}

export function buildComparabilityChecks(page, results, context = summarizeComparisonContext(page, results)) {
  const fingerprints = results.map((result) => fingerprintEnvironment(result));
  const hydrationRelevant = context.tracks.includes("hydration-runtime");
  const rebuildRelevant = context.tracks.includes("rebuild");
  const contracts = hydrationRelevant ? measurementContractsForHydration(results) : [];
  const rebuildContracts = rebuildRelevant ? rebuildContractsForEntries(context.filteredEntries) : [];
  const rebuildFingerprints = uniqueValues(rebuildContracts.map((entry) => rebuildContractFingerprint(entry.contract)));
  const rebuildMissingContracts = rebuildContracts.filter((entry) => !entry.contract).map((entry) => entry.frameworkId);
  const rebuildDirectlyComparable = rebuildContracts.length > 0 && rebuildContracts.every((entry) => entry.contract?.directlyComparable === true);
  const rebuildDetails = rebuildContracts.map((entry) => {
    if (!entry.contract) {
      return `${entry.frameworkId} (missing contract)`;
    }
    return `${entry.frameworkId} (${entry.contract.settleMethod})`;
  });
  const rebuildCaveats = uniqueValues(rebuildContracts.map((entry) => entry.contract?.requiredCaveat).filter(Boolean));
  const duplicateFrameworks = results.length !== uniqueValues(results.flatMap((result) => (result.results || []).map((entry) => entry.frameworkId))).length;
  const sparse = buildSparseCellDetails(context);
  const multiTrack = context.tracks.length > 1;
  const runnerKinds = uniqueValues(results.map((result) => result.runner));
  const multiTrackCompatible = !multiTrack || results.every((result) => result.runner === "matrix");
  const trackCoverage = context.tracks.every((trackId) => {
    return context.frameworks.every((frameworkId) => {
      return context.filteredEntries.some((entry) => entry.track === trackId && entry.frameworkId === frameworkId);
    });
  });

  return [
    {
      check: "Git commit",
      status: uniqueValues(fingerprints.map((entry) => entry.gitCommit)).length === 1 ? "match" : "mixed",
      detail: formatCodeList(uniqueValues(fingerprints.map((entry) => entry.gitCommit))),
      severity: "error",
    },
    {
      check: "Machine fingerprint",
      status: uniqueValues(fingerprints.map((entry) => entry.machine)).length === 1 ? "match" : "mixed",
      detail: uniqueValues(fingerprints.map((entry) => entry.machine)).join(", "),
      severity: "error",
    },
    {
      check: "Runtime fingerprint",
      status: uniqueValues(fingerprints.map((entry) => entry.runtime)).length === 1 ? "match" : "mixed",
      detail: uniqueValues(fingerprints.map((entry) => entry.runtime)).join(", "),
      severity: "error",
    },
    {
      check: "Warmup/sample counts",
      status: uniqueValues(fingerprints.map((entry) => entry.samples)).length === 1 ? "match" : "mixed",
      detail: uniqueValues(fingerprints.map((entry) => entry.samples)).join(", "),
      severity: "error",
    },
    {
      check: "Framework count",
      status: context.frameworks.length >= 2 ? "match" : "limited",
      detail: formatCodeList(context.frameworks),
      severity: "error",
    },
    {
      check: "Requested tracks",
      status: context.tracks.length > 0 ? "match" : "limited",
      detail: formatCodeList(context.tracks),
      severity: "error",
    },
    {
      check: "Track coverage by framework",
      status: trackCoverage ? "match" : "limited",
      detail: trackCoverage ? "Each selected framework covers every requested track." : "At least one framework is missing a requested track.",
      severity: "error",
    },
    {
      check: "Run shape compatibility",
      status: multiTrackCompatible ? "match" : "mixed",
      detail: multiTrack
        ? `Requested tracks: ${formatCodeList(context.tracks)}; runners: ${formatCodeList(runnerKinds)}`
        : `Runners: ${formatCodeList(runnerKinds)}`,
      severity: "error",
    },
    {
      check: "Sparse comparison cells",
      status: sparse.failures.length === 0 && sparse.duplicateRows.length === 0 ? "match" : "limited",
      detail: sparse.failures.length === 0 && sparse.duplicateRows.length === 0
        ? "Every requested track/case cell contains one row per framework."
        : [...sparse.failures, ...sparse.duplicateRows.map((value) => `${value} has duplicate framework rows`)].join("; "),
      severity: "error",
    },
    {
      check: "Duplicate framework inputs",
      status: duplicateFrameworks ? "mixed" : "match",
      detail: duplicateFrameworks ? "Multiple selected inputs contribute the same framework." : "Each selected input contributes a distinct framework.",
      severity: "error",
    },
    {
      check: "Hydration measurement contract",
      status: !hydrationRelevant ? "not-applicable" : contracts.length <= 1 ? "match" : "mixed",
      detail: !hydrationRelevant
        ? "Hydration/runtime is not part of this comparison page."
        : contracts.length <= 1
          ? "Contracts match for hydration/runtime rows."
          : "Multiple measurement contract shapes were detected.",
      severity: hydrationRelevant ? "error" : "info",
    },
    {
      check: "Rebuild measurement contract",
      status: !rebuildRelevant
        ? "not-applicable"
        : rebuildMissingContracts.length > 0
          ? "limited"
          : !rebuildDirectlyComparable
            ? "limited"
            : rebuildFingerprints.length === 1
              ? "match"
              : "mixed",
      detail: !rebuildRelevant
        ? "Rebuild is not part of this comparison page."
        : rebuildMissingContracts.length > 0
          ? `Missing rebuild contract metadata for ${rebuildMissingContracts.join(", ")}.`
          : !rebuildDirectlyComparable
            ? `${rebuildDetails.join("; ")}. ${rebuildCaveats.join(" ")}`
            : rebuildFingerprints.length === 1
              ? `Contracts match for rebuild rows: ${rebuildDetails.join("; ")}.`
              : `Multiple rebuild contract shapes were detected: ${rebuildDetails.join("; ")}.`,
      severity: rebuildRelevant ? "error" : "info",
    },
  ];
}

export function assertPublishableComparison(page, results) {
  const context = summarizeComparisonContext(page, results);
  const checks = buildComparabilityChecks(page, results, context);
  const failures = checks.filter((entry) => entry.severity === "error" && entry.status !== "match" && entry.status !== "not-applicable");
  if (failures.length > 0) {
    throw new Error(
      `Comparison page ${page.id} failed publish-time comparability gates\n${
        failures.map((entry) => `- ${entry.check}: ${entry.detail}`).join("\n")
      }`,
    );
  }
  return { context, checks };
}
