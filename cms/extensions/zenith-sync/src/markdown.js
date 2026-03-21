import { marked } from "marked";
import YAML from "yaml";

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

export function parseFrontmatter(raw) {
  const normalized = normalizeLineEndings(raw);
  if (!normalized.startsWith("---\n")) {
    return { data: {}, content: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { data: {}, content: normalized };
  }

  const yamlBlock = normalized.slice(4, endIndex);
  const content = normalized.slice(endIndex + 5);

  try {
    return {
      data: YAML.parse(yamlBlock) || {},
      content,
    };
  } catch {
    return { data: {}, content: normalized };
  }
}

export function renderMarkdown(markdown) {
  return marked.parse(markdown, {
    async: false,
    gfm: true,
    breaks: false,
  });
}

export function extractTitle(markdown, fallback = "") {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

export function extractSummary(markdown, fallback = "") {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (block.startsWith("```")) {
      continue;
    }

    const cleaned = normalizeSummaryBlock(block);
    if (cleaned) return cleaned;
  }

  return fallback;
}

export function excerpt(text, limit = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function normalizeSummaryBlock(block) {
  const cleaned = block
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();

  return cleaned;
}
