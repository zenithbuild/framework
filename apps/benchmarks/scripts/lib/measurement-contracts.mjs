const SHARED_REBUILD_CAVEAT = "Rebuild durations in this phase are not published as flat cross-framework comparisons because the settle contracts are framework-specific.";

function browserProbeContract() {
  return {
    track: "rebuild",
    contractVersion: "rebuild-phase-1",
    settleMethod: "browser-probe",
    signalSource: "route reload + expected DOM state",
    freshnessProofType: "observed post-mutation page state",
    routeProbeRole: "primary freshness proof and route verification",
    directlyComparable: false,
    requiredCaveat: "This rebuild metric settles on route reload and observed DOM freshness. It is not directly comparable to dev-state-settled rebuild metrics.",
    comparisonBlockReason: SHARED_REBUILD_CAVEAT,
  };
}

function devStateContract() {
  return {
    track: "rebuild",
    contractVersion: "rebuild-phase-1",
    settleMethod: "dev-state",
    signalSource: "/__zenith_dev/state",
    freshnessProofType: "buildId advancement + ok status",
    routeProbeRole: "secondary route fetch verification after framework settle",
    directlyComparable: false,
    requiredCaveat: "This rebuild metric settles on Zenith dev-state/build-id progression, then performs route verification. It is not directly comparable to browser-probe rebuild metrics.",
    comparisonBlockReason: SHARED_REBUILD_CAVEAT,
  };
}

export function buildRebuildMeasurementContract(frameworkConfig) {
  const settleMethod = frameworkConfig?.rebuildSettle?.mode || "browser-probe";
  if (settleMethod === "dev-state") {
    return devStateContract();
  }
  if (settleMethod === "browser-probe") {
    return browserProbeContract();
  }
  throw new Error(`Unsupported rebuild settle mode "${settleMethod}"`);
}

export function resolveRebuildMeasurementContract(entry) {
  if (entry?.measurementContract?.track === "rebuild") {
    return entry.measurementContract;
  }

  const settleMethod = entry?.session?.rebuildSettleMode || "";
  if (settleMethod === "dev-state") {
    return devStateContract();
  }
  if (settleMethod === "browser-probe") {
    return browserProbeContract();
  }
  return null;
}

export function rebuildContractFingerprint(contract) {
  if (!contract) {
    return "";
  }
  return JSON.stringify({
    contractVersion: contract.contractVersion || "",
    settleMethod: contract.settleMethod || "",
    signalSource: contract.signalSource || "",
    freshnessProofType: contract.freshnessProofType || "",
    routeProbeRole: contract.routeProbeRole || "",
    directlyComparable: Boolean(contract.directlyComparable),
  });
}
