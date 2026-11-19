// §2 "How it works" stage content (copy.md §3; Figma 155:8434 / 155:8765 / 155:11895 frames).
// Code panels are static, trusted strings rendered through unsafeHTML after escaping.

export type PipelineStageKey = "build" | "compile" | "bundle" | "run";
type Tone = "fg" | "muted" | "purple" | "blue" | "gold" | "magenta" | "success";
type CodePart = [Tone, string];

export interface PipelineStage {
  key: PipelineStageKey;
  number: number;
  name: string;
  subtitle: string;
  tags: Array<{ label: string; tone: "blue" | "gold" | "purple" | "magenta" }>;
  codeLabel: string;
  code: CodePart[][];
  aside: Array<string | { code: string }>;
  link: { label: string; href: string };
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "build", number: 1, name: "Build", subtitle: "zenith build", tags: [],
    codeLabel: "terminal",
    code: [[["fg", "$ zenith build"]], [["muted", "Building…"]], [["muted", "Built ‹n› page(s), ‹n› asset(s)"]]],
    aside: [{ code: "zenith build" }, " makes a route manifest, compiles each page into an envelope, and runs the bundler into ", { code: ".zenith-output/static" }, "."],
    link: { label: "CLI →", href: "/docs/cli-contract" },
  },
  {
    key: "compile", number: 2, name: "Compile", subtitle: "CompilerOutput tables",
    tags: [{ label: "signals", tone: "blue" }, { label: "expression_bindings", tone: "gold" }, { label: "marker_bindings", tone: "gold" }],
    codeLabel: "bundler checks before it accepts the tables · bundler_contracts.rs:50-104",
    code: [
      [["gold", "expression_bindings"], ["fg", ".len == "], ["purple", "expressions"], ["fg", ".len"]],
      [["gold", "marker_bindings"], ["fg", ".len     == "], ["purple", "expressions"], ["fg", ".len"]],
      [["blue", "signals"], ["fg", "[i].state_index             < "], ["muted", "hoisted.state"], ["fg", ".len"]],
      [["gold", "expression_bindings"], ["fg", "[i].marker_index < "], ["purple", "expressions"], ["fg", ".len"]],
      [["gold", "expression_bindings"], ["fg", "[i].signal_index < "], ["blue", "signals"], ["fg", ".len"]],
    ],
    aside: ["The compiler returns one ", { code: "CompilerOutput" }, " per compiled input."],
    link: { label: "Compiler →", href: "/how-it-works/compiler" },
  },
  {
    key: "bundle", number: 3, name: "Bundle", subtitle: "manifest.json", tags: [],
    codeLabel: ".zenith-output/static/manifest.json",
    code: [[["fg", "{"]], [["gold", "  entry, base_path, css, core,"]], [["gold", "  hash, router,"]], [["gold", "  chunks: { \"/\": … },"]], [["gold", "  server_routes"]], [["fg", "}"]]],
    aside: ["The bundler writes ", { code: "manifest.json" }, " with the runtime entry, base path, CSS file, core file, chunk map, server route set, content hash, and the router script path when the client router is on."],
    link: { label: "Bundler →", href: "/docs/contracts/bundler-contract" },
  },
  {
    key: "run", number: 4, name: "Run", subtitle: "hydrate applies the tables", tags: [],
    codeLabel: "packages/runtime/src/hydrate.js",
    code: [[["magenta", "hydrate(payload)"]], [["fg", "  _createSignalMap("], ["blue", "signals"], ["fg", ", …)"]], [["gold", "  _hydrateMarkers"], ["fg", "(context)"]], [["fg", "  _bindSignalSubscriptions(…)"]]],
    aside: [{ code: "hydrate" }, " checks the payload, builds a signal map by index, applies each text or attribute marker, and binds the event table."],
    link: { label: "Runtime →", href: "/docs/contracts/runtime-contract" },
  },
];

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function stageByKey(key: string): PipelineStage {
  return PIPELINE_STAGES.find((stage) => stage.key === key) || PIPELINE_STAGES[0];
}

/** `compact` collapses alignment runs of spaces (mobile wraps the lines, so column alignment is moot). */
export function stageCodeHtml(stage: PipelineStage, compact = false): string {
  const shape = (text: string, index: number) => (compact && index > 0 ? text.replace(/ {2,}/g, " ") : text);
  return stage.code
    .map((line) => `<span class="pipeline-code-line">${line.map(([tone, text], index) => `<span class="tone-${tone}">${escapeHtml(shape(text, index))}</span>`).join("")}</span>`)
    .join("");
}

export function stageAsideHtml(stage: PipelineStage): string {
  return stage.aside
    .map((part) => (typeof part === "string" ? escapeHtml(part) : `<code class="v1-inline-code">${escapeHtml(part.code)}</code>`))
    .join("");
}

export function stageTagsHtml(stage: PipelineStage): string {
  return stage.tags.map((tag) => `<span class="v1-tag v1-tag-${tag.tone}">${escapeHtml(tag.label)}</span>`).join("");
}
