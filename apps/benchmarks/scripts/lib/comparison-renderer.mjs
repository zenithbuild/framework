import { dirname, relative } from "node:path";
import { buildComparabilityChecks, summarizeComparisonContext } from "./comparison-gates.mjs";

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

function formatSamples(samples, pick) {
  return samples
    .map((sample) => {
      const value = pick(sample);
      return typeof value === "number" ? value.toFixed(2) : "-";
    })
    .join(", ");
}

function spreadFromSummary(summary) {
  if (!summary || typeof summary.minMs !== "number" || typeof summary.maxMs !== "number") {
    return "-";
  }
  return formatMs(summary.maxMs - summary.minMs);
}

function markdownTable(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [head, sep, ...body].join("\n");
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

function entriesForTrackCase(entries, track, caseId) {
  return entries
    .filter((entry) => entry.track === track && entry.caseId === caseId)
    .sort((left, right) => left.frameworkId.localeCompare(right.frameworkId));
}

function artifactLinks(entry, outputPath) {
  const sample = entry.samples?.[0] || {};
  if (entry.track === "cold-build") {
    return [
      markdownLink("dist size", outputPath, sample.distSizePath),
      markdownLink("stdout", outputPath, sample.stdoutPath),
      markdownLink("stderr", outputPath, sample.stderrPath),
    ].filter(Boolean);
  }
  if (entry.track === "dev-startup") {
    return [
      markdownLink("ready state", outputPath, sample.readyStatePath),
      markdownLink("stdout", outputPath, sample.stdoutPath),
      markdownLink("stderr", outputPath, sample.stderrPath),
    ].filter(Boolean);
  }
  if (entry.track === "hydration-runtime") {
    return [
      markdownLink("metrics", outputPath, sample.metricsPath),
      markdownLink("trace", outputPath, sample.tracePath),
      markdownLink("screenshot", outputPath, sample.screenshotPath),
      markdownLink("console", outputPath, sample.consolePath),
    ].filter(Boolean);
  }
  if (entry.track === "rebuild") {
    return [
      markdownLink("mutation", outputPath, sample.mutationPath),
      markdownLink("browser probe", outputPath, sample.browserProbePath),
      markdownLink("restore", outputPath, sample.restore?.metadataPath),
      markdownLink("restore browser probe", outputPath, sample.restore?.browserProbePath),
      markdownLink("stdout", outputPath, sample.stdoutPath),
    ].filter(Boolean);
  }
  return [];
}

function renderTrackCaseTable(track, entries) {
  if (track === "cold-build") {
    return markdownTable(
      ["Framework", "Samples", "Median", "Spread", "Dist Files", "Dist Bytes"],
      entries.map((entry) => [
        entry.frameworkId,
        formatSamples(entry.samples || [], (sample) => sample.durationMs),
        formatMs(entry.summary?.medianMs),
        spreadFromSummary(entry.summary),
        String(entry.samples?.[0]?.dist?.fileCount ?? "-"),
        formatBytes(entry.samples?.[0]?.dist?.totalBytes),
      ]),
    );
  }

  if (track === "dev-startup") {
    return markdownTable(
      ["Framework", "Samples", "Median", "Spread", "Ready Status", "Build Status"],
      entries.map((entry) => [
        entry.frameworkId,
        formatSamples(entry.samples || [], (sample) => sample.durationMs),
        formatMs(entry.summary?.medianMs),
        spreadFromSummary(entry.summary),
        String(entry.samples?.[0]?.readyProbe?.status ?? "-"),
        entry.samples?.[0]?.readyProbe?.buildStatus || "-",
      ]),
    );
  }

  if (track === "hydration-runtime") {
    return markdownTable(
      [
        "Framework",
        "Browser Ready Samples",
        "Median",
        "Spread",
        "DOM Interactive Samples",
        "FCP Samples",
        "Script Count Samples",
        "Long Task Count Samples",
        "Page Errors",
      ],
      entries.map((entry) => [
        entry.frameworkId,
        formatSamples(entry.samples || [], (sample) => sample.durationMs),
        formatMs(entry.summary?.medianMs),
        spreadFromSummary(entry.summary),
        formatSamples(entry.samples || [], (sample) => sample.comparableMetrics?.navigation?.domInteractiveMs),
        formatSamples(entry.samples || [], (sample) => sample.comparableMetrics?.paints?.firstContentfulPaintMs),
        formatSamples(entry.samples || [], (sample) => sample.comparableMetrics?.scripts?.count),
        formatSamples(entry.samples || [], (sample) => sample.comparableMetrics?.longTasks?.count),
        String(entry.samples?.[0]?.frameworkSpecific?.pageErrorCount ?? "-"),
      ]),
    );
  }

  return markdownTable(
    ["Framework", "Mutation Track", "Samples", "Median", "Spread", "Restore Match"],
    entries.map((entry) => [
      entry.frameworkId,
      entry.mutationTrack || "-",
      formatSamples(entry.samples || [], (sample) => sample.durationMs),
      formatMs(entry.summary?.medianMs),
      spreadFromSummary(entry.summary),
      (entry.samples || []).map((sample) => String(sample.restore?.contentMatchesOriginal ?? "-")).join(", "),
    ]),
  );
}

function renderArtifactList(entries, outputPath) {
  const lines = [];
  for (const entry of entries) {
    const links = artifactLinks(entry, outputPath);
    if (links.length === 0) {
      continue;
    }
    const mutation = entry.mutationTrack ? ` / ${entry.mutationTrack}` : "";
    lines.push(`- \`${entry.frameworkId}${mutation}\`: ${links.join(", ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "_No artifact links recorded._";
}

export function renderComparativeReport(page, results, options = {}) {
  const outputPath = options.outputPath || "";
  const context = summarizeComparisonContext(page, results);
  const filteredEntries = context.filteredEntries;
  const frameworks = context.frameworks;
  const tracks = context.tracks;
  const cases = context.cases;
  const checks = buildComparabilityChecks(page, results, context);

  const sections = [
    `# ${page.title}`,
    "",
    page.description || "",
    "",
    "## Caveats",
    "- This page is generated from multiple validated benchmark result files listed below.",
    "- Tables show recorded samples, medians, and spread only. They do not add ranking or winner language.",
    "- If a requested track or case is missing from one or more runs, the page shows the available rows and the overlap checks instead of filling missing values.",
    "",
    "## Compared Runs",
    markdownTable(
      ["Framework", "Run ID", "Runner", "Generated At", "Source JSON"],
      results.map((result) => [
        uniqueValues((result.results || []).map((entry) => entry.frameworkId)).join(", "),
        `\`${result.runId}\``,
        `\`${result.runner}\``,
        result.generatedAt || "-",
        `\`${options.inputPathMap?.get(result.runId) || "-"}\``,
      ]),
    ),
    "",
    "## Environment Summary",
    markdownTable(
      ["Field", "Values"],
      [
        ["Frameworks", frameworks.map((value) => `\`${value}\``).join(", ") || "-"],
        ["Tracks", tracks.map((value) => `\`${value}\``).join(", ") || "-"],
        ["Cases", cases.map((value) => `\`${value}\``).join(", ") || "-"],
        ["Git Commits", uniqueValues(results.map((result) => result.environment?.gitCommit || "-")).map((value) => `\`${value}\``).join(", ")],
        ["Warmup / Samples", uniqueValues(results.map((result) => `${result.environment?.warmupCount || 0}/${result.environment?.sampleCount || 0}`)).join(", ")],
      ],
    ),
    "",
    "## Comparability Checks",
    markdownTable(
      ["Check", "Status", "Detail"],
      checks.map((entry) => [entry.check, entry.status, entry.detail]),
    ),
  ];

  if (frameworks.length < 2 || tracks.length === 0 || cases.length === 0) {
    sections.push("", "## Comparison Status", "Not enough overlapping validated data was found to render a meaningful comparison table.");
    return `${sections.join("\n")}\n`;
  }

  for (const track of tracks) {
    sections.push("", `## ${titleize(track)}`);
    if (track === "hydration-runtime") {
      sections.push(
        "Comparable metrics in this section come from the shared browser runtime contract. Framework-specific sidecars remain in artifact links and raw metric files.",
      );
    } else if (track === "rebuild") {
      sections.push(
        "Rebuild rows are only publishable when the selected rebuild measurement contracts pass the comparability gates. Artifact links include the contract-specific freshness proof where available.",
      );
    } else {
      sections.push("Comparable metric in this section is the recorded `durationMs` summary for the selected track.");
    }

    for (const caseId of cases) {
      const entries = entriesForTrackCase(filteredEntries, track, caseId);
      if (entries.length === 0) {
        continue;
      }
      const missing = frameworks.filter((frameworkId) => !entries.some((entry) => entry.frameworkId === frameworkId));
      sections.push(
        "",
        `### ${titleize(caseId)}`,
        renderTrackCaseTable(track, entries),
      );
      if (missing.length > 0) {
        sections.push("", `Missing frameworks for this case/track: ${missing.map((value) => `\`${value}\``).join(", ")}`);
      }
      sections.push("", "#### Artifact Pointers", renderArtifactList(entries, outputPath));
    }
  }

  return `${sections.join("\n")}\n`;
}
