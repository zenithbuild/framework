import { dirname, relative } from "node:path";
import { resolveRebuildMeasurementContract } from "./measurement-contracts.mjs";

function titleize(value) {
  return String(value || "")
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(2)} ms`;
}

function formatBytes(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value} B (${(value / 1024).toFixed(2)} KiB)`;
}

function formatList(values) {
  const items = values.filter((value) => value !== null && value !== undefined && value !== "");
  return items.length > 0 ? items.join(", ") : "-";
}

function formatSamples(samples, key = "durationMs") {
  return samples
    .map((sample) => {
      const value = key.split(".").reduce((current, segment) => current?.[segment], sample);
      return typeof value === "number" ? value.toFixed(2) : "-";
    })
    .join(", ");
}

function relativeLink(outputPath, targetPath) {
  if (!outputPath || !targetPath) {
    return "";
  }
  const rel = relative(dirname(outputPath), targetPath).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function markdownLink(label, outputPath, targetPath) {
  if (!targetPath) {
    return "";
  }
  return `[${label}](${relativeLink(outputPath, targetPath)})`;
}

function markdownTable(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function spreadFromSummary(summary) {
  if (!summary || typeof summary.minMs !== "number" || typeof summary.maxMs !== "number") {
    return "-";
  }
  return formatMs(summary.maxMs - summary.minMs);
}

function renderRunMetadata(result, inputPath) {
  const frameworks = uniqueValues(result.results.map((entry) => entry.frameworkId));
  const cases = uniqueValues(result.results.map((entry) => entry.caseId));
  const tracks = uniqueValues(result.results.map((entry) => entry.track));
  const rows = [
    ["Run ID", `\`${result.runId}\``],
    ["Runner", `\`${result.runner}\``],
    ["Generated At", result.generatedAt || "-"],
    ["Source JSON", `\`${inputPath}\``],
    ["Frameworks", formatList(frameworks)],
    ["Cases", formatList(cases)],
    ["Tracks", formatList(tracks)],
    ["Warmups", String(result.environment?.warmupCount ?? "-")],
    ["Recorded Samples", String(result.environment?.sampleCount ?? "-")],
    ["Git Commit", `\`${result.environment?.gitCommit || "-"}\``],
  ];
  return markdownTable(["Field", "Value"], rows);
}

function renderEnvironment(result) {
  const machine = result.environment?.machine || {};
  const runtime = result.environment?.runtime || {};
  const rows = [
    ["Platform", formatList([machine.platform, machine.release, machine.arch])],
    ["CPU", formatList([machine.cpuModel, `${machine.cpuCount || "-"} cores`])],
    ["Memory", typeof machine.totalMemoryMb === "number" ? `${machine.totalMemoryMb} MiB` : "-"],
    ["Node", runtime.node || "-"],
    ["npm", runtime.npm || "-"],
    ["bun", runtime.bun || "-"],
  ];
  return markdownTable(["Field", "Value"], rows);
}

function renderCoverage(result) {
  const rows = (result.environment?.fixtures || []).map((fixture) => [
    fixture.frameworkId || "-",
    fixture.caseId || "-",
    `\`${fixture.lockfileSha256 || "-"}\``,
    `\`${fixture.lockfilePath || "-"}\``,
  ]);
  return rows.length > 0
    ? markdownTable(["Framework", "Case", "Lockfile SHA-256", "Lockfile"], rows)
    : "_No fixture metadata recorded._";
}

function resultArtifactLinks(entry, outputPath) {
  const installLinks = [
    markdownLink("install stdout", outputPath, entry.install?.stdoutPath),
    markdownLink("install stderr", outputPath, entry.install?.stderrPath),
  ].filter(Boolean);
  const sample = entry.samples?.[0] || {};
  const track = entry.track;

  if (track === "cold-build") {
    return [
      ...installLinks,
      markdownLink("sample-1 stdout", outputPath, sample.stdoutPath),
      markdownLink("sample-1 stderr", outputPath, sample.stderrPath),
      markdownLink("sample-1 dist size", outputPath, sample.distSizePath),
      markdownLink("sample-1 startup profile", outputPath, sample.startupProfilePath),
    ].filter(Boolean);
  }

  if (track === "dev-startup") {
    return [
      ...installLinks,
      markdownLink("sample-1 ready state", outputPath, sample.readyStatePath),
      markdownLink("sample-1 stdout", outputPath, sample.stdoutPath),
      markdownLink("sample-1 startup profile", outputPath, sample.startupProfilePath),
    ].filter(Boolean);
  }

  if (track === "hydration-runtime") {
    return [
      ...installLinks,
      markdownLink("session ready state", outputPath, entry.session?.sessionReadyStatePath),
      markdownLink("sample-1 metrics", outputPath, sample.metricsPath),
      markdownLink("sample-1 console", outputPath, sample.consolePath),
      markdownLink("sample-1 trace", outputPath, sample.tracePath),
      markdownLink("sample-1 screenshot", outputPath, sample.screenshotPath),
    ].filter(Boolean);
  }

  if (track === "rebuild") {
    return [
      ...installLinks,
      markdownLink("sample-1 mutation", outputPath, sample.mutationPath),
      markdownLink("sample-1 browser probe", outputPath, sample.browserProbePath),
      markdownLink("sample-1 stdout", outputPath, sample.stdoutPath),
      markdownLink("sample-1 restore", outputPath, sample.restore?.metadataPath),
      markdownLink("sample-1 restore browser probe", outputPath, sample.restore?.browserProbePath),
    ].filter(Boolean);
  }

  return installLinks;
}

function renderArtifactPointers(entries, outputPath) {
  const lines = [];
  for (const entry of entries) {
    const mutation = entry.mutationTrack ? ` / ${entry.mutationTrack}` : "";
    const links = resultArtifactLinks(entry, outputPath);
    if (links.length === 0) {
      continue;
    }
    lines.push(`- \`${entry.frameworkId}\` / \`${entry.caseId}${mutation}\`: ${links.join(", ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "_No artifact links recorded._";
}

function renderColdBuild(entries) {
  const rows = entries.map((entry) => {
    const dist = entry.samples?.[0]?.dist || {};
    return [
      entry.frameworkId,
      entry.caseId,
      formatMs(entry.install?.durationMs),
      formatSamples(entry.samples),
      formatMs(entry.summary?.medianMs),
      spreadFromSummary(entry.summary),
      typeof dist.fileCount === "number" ? String(dist.fileCount) : "-",
      formatBytes(dist.totalBytes),
    ];
  });
  return {
    note: "Comparable metric shown in this section: build `durationMs` from each recorded sample.",
    table: markdownTable(
      ["Framework", "Case", "Install", "Sample Durations", "Median", "Spread", "Dist Files", "Dist Bytes"],
      rows,
    ),
  };
}

function renderDevStartup(entries) {
  const rows = entries.map((entry) => {
    const sample = entry.samples?.[0] || {};
    return [
      entry.frameworkId,
      entry.caseId,
      formatMs(entry.install?.durationMs),
      formatSamples(entry.samples),
      formatMs(entry.summary?.medianMs),
      spreadFromSummary(entry.summary),
      String(sample.readyProbe?.status || "-"),
      sample.readyProbe?.buildStatus || "-",
    ];
  });
  return {
    note: "Comparable metric shown in this section: startup `durationMs` measured from process launch to ready probe success.",
    table: markdownTable(
      ["Framework", "Case", "Install", "Sample Durations", "Median", "Spread", "Ready Status", "Build Status"],
      rows,
    ),
  };
}

function hydrationMetricSamples(samples, key) {
  return samples
    .map((sample) => {
      const value = key.split(".").reduce((current, segment) => current?.[segment], sample.comparableMetrics);
      return typeof value === "number" ? value.toFixed(2) : "-";
    })
    .join(", ");
}

function renderHydration(entries, measurementContract) {
  const comparable = Array.isArray(measurementContract?.comparableMetrics)
    ? measurementContract.comparableMetrics.map((item) => `\`${item}\``).join(", ")
    : "_Not recorded._";
  const sidecars = Array.isArray(measurementContract?.frameworkSpecificSidecars)
    ? measurementContract.frameworkSpecificSidecars.map((item) => `\`${item}\``).join(", ")
    : "_Not recorded._";

  const rows = entries.map((entry) => {
    const sample = entry.samples?.[0] || {};
    return [
      entry.frameworkId,
      entry.caseId,
      formatSamples(entry.samples),
      formatMs(entry.summary?.medianMs),
      spreadFromSummary(entry.summary),
      hydrationMetricSamples(entry.samples, "navigation.domInteractiveMs"),
      hydrationMetricSamples(entry.samples, "paints.firstContentfulPaintMs"),
      hydrationMetricSamples(entry.samples, "scripts.count"),
      hydrationMetricSamples(entry.samples, "longTasks.count"),
      String(sample.frameworkSpecific?.pageErrorCount ?? "-"),
    ];
  });

  return {
    note: [
      "Comparable metrics rendered below come from the shared browser runtime contract.",
      `Comparable metrics recorded in this phase: ${comparable}.`,
      `Framework-specific sidecars recorded in this phase: ${sidecars}.`,
    ].join("\n\n"),
    table: markdownTable(
      [
        "Framework",
        "Case",
        "Browser Ready Samples",
        "Median",
        "Spread",
        "DOM Interactive Samples",
        "FCP Samples",
        "Script Count Samples",
        "Long Task Count Samples",
        "Page Errors",
      ],
      rows,
    ),
  };
}

function renderRebuild(entries) {
  const contractRows = uniqueValues(entries.map((entry) => entry.frameworkId)).map((frameworkId) => {
    const entry = entries.find((candidate) => candidate.frameworkId === frameworkId);
    const contract = resolveRebuildMeasurementContract(entry);
    return [
      frameworkId,
      contract?.settleMethod || "-",
      contract?.signalSource || "-",
      contract?.freshnessProofType || "-",
      contract?.routeProbeRole || "-",
      String(contract?.directlyComparable ?? "-"),
    ];
  });
  const caveats = uniqueValues(entries.map((entry) => resolveRebuildMeasurementContract(entry)?.requiredCaveat).filter(Boolean));
  const rows = entries.map((entry) => {
    const restoreFlags = (entry.samples || []).map((sample) => String(sample.restore?.contentMatchesOriginal ?? "-")).join(", ");
    const restoreDurations = (entry.samples || [])
      .map((sample) => formatMs(sample.restore?.durationMs))
      .join(", ");
    return [
      entry.frameworkId,
      entry.caseId,
      entry.mutationTrack || "-",
      formatSamples(entry.samples),
      formatMs(entry.summary?.medianMs),
      spreadFromSummary(entry.summary),
      restoreFlags,
      restoreDurations,
    ];
  });
  return {
    note: [
      "Recorded rebuild durations are shown exactly as captured by the harness.",
      "These rows carry an explicit rebuild measurement contract and are not treated as flat cross-framework comparison claims unless the contract says they are directly comparable.",
    ].join("\n\n"),
    contractTable: markdownTable(
      ["Framework", "Settle Method", "Signal Source", "Freshness Proof", "Route Probe Role", "Directly Comparable"],
      contractRows,
    ),
    contractCaveats: caveats,
    table: markdownTable(
      ["Framework", "Case", "Mutation Track", "Sample Durations", "Median", "Spread", "Restore Match", "Restore Durations"],
      rows,
    ),
  };
}

export function deriveReportSlug(result) {
  const frameworks = uniqueValues(result.results.map((entry) => entry.frameworkId));
  const frameworkPart = frameworks.length === 1 ? frameworks[0] : "multi-framework";
  return `${result.runId}-${frameworkPart}-${result.runner}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function buildReportTitle(result) {
  const frameworks = uniqueValues(result.results.map((entry) => entry.frameworkId));
  const frameworkPart = frameworks.length === 1 ? titleize(frameworks[0]) : "Multi-Framework";
  return `Benchmark Results ${result.runId} (${frameworkPart}, ${titleize(result.runner)})`;
}

export function renderBenchmarkReport(result, options = {}) {
  const inputPath = options.inputPath || "";
  const outputPath = options.outputPath || "";
  const measurementContract = result.measurementContract
    || result.results.find((entry) => entry.measurementContract)?.measurementContract
    || null;
  const grouped = new Map();

  for (const entry of result.results || []) {
    const bucket = grouped.get(entry.track) || [];
    bucket.push(entry);
    grouped.set(entry.track, bucket);
  }

  const sections = [
    `# ${buildReportTitle(result)}`,
    "",
    "## Caveats",
    "- This page is a direct rendering of validated benchmark result JSON.",
    "- Numbers shown here come from recorded samples, medians, and spreads already present in the source files.",
    "- Missing frameworks, tracks, or cases indicate that no validated result file for that cell was included in this run.",
    "- Hydration/runtime output mixes shared browser metrics with framework-specific sidecars; those categories are labeled separately.",
    "",
    "## Run Metadata",
    renderRunMetadata(result, inputPath),
    "",
    "## Environment",
    renderEnvironment(result),
    "",
    "## Fixture Coverage",
    renderCoverage(result),
  ];

  for (const track of uniqueValues((result.results || []).map((entry) => entry.track))) {
    const entries = grouped.get(track) || [];
    let rendered;

    if (track === "cold-build") {
      rendered = renderColdBuild(entries);
    } else if (track === "dev-startup") {
      rendered = renderDevStartup(entries);
    } else if (track === "hydration-runtime") {
      rendered = renderHydration(entries, measurementContract);
    } else if (track === "rebuild") {
      rendered = renderRebuild(entries);
    } else {
      rendered = {
        note: "No specialized renderer is defined for this track.",
        table: markdownTable(
          ["Framework", "Case", "Samples", "Median", "Spread"],
          entries.map((entry) => [
            entry.frameworkId,
            entry.caseId,
            formatSamples(entry.samples),
            formatMs(entry.summary?.medianMs),
            spreadFromSummary(entry.summary),
          ]),
        ),
      };
    }

    sections.push(
      "",
      `## ${titleize(track)}`,
      rendered.note,
      "",
      ...(rendered.contractTable
        ? ["### Measurement Contract", rendered.contractTable, ""]
        : []),
      ...(Array.isArray(rendered.contractCaveats) && rendered.contractCaveats.length > 0
        ? ["### Contract Caveats", ...rendered.contractCaveats.map((entry) => `- ${entry}`), ""]
        : []),
      rendered.table,
      "",
      "### Artifact Pointers",
      renderArtifactPointers(entries, outputPath),
    );
  }

  return `${sections.join("\n")}\n`;
}
