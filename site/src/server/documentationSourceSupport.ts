import { readFile } from "node:fs/promises";

interface LocalDocsIndexRecord {
  doc?: string;
  tags?: string[];
}

const DOCS_INDEX_URL = new URL("../../../docs/public/ai/docs.index.jsonl", import.meta.url);

export async function readLocalDocumentationTagsMap(): Promise<Map<string, string[]>> {
  const raw = await readFile(DOCS_INDEX_URL, "utf8");
  const tagsByDoc = new Map<string, Set<string>>();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const record = JSON.parse(trimmed) as LocalDocsIndexRecord;
    if (!record.doc) continue;
    const next = tagsByDoc.get(record.doc) || new Set<string>();
    for (const tag of record.tags || []) {
      const normalized = String(tag || "").trim();
      if (normalized) next.add(normalized);
    }
    tagsByDoc.set(record.doc, next);
  }

  return new Map([...tagsByDoc.entries()].map(([doc, tags]) => [doc, [...tags].sort((a, b) => a.localeCompare(b))]));
}

export function deriveDocumentationLeafSlug(value: string): string {
  const normalized = String(value || "")
    .replace(/^docs\/documentation\//, "")
    .replace(/^documentation\//, "")
    .replace(/\.md$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export function stripDocumentationFrontmatter(raw: string): string {
  const source = String(raw || "");
  if (!source.startsWith("---")) {
    return source;
  }

  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? source.slice(match[0].length) : source;
}

export function extractDocumentationDescription(source: string, fallback: string): string {
  const cleaned = String(source || "")
    .replace(/^# .*\n+/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[<`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

export function excerptText(source: string, maxLength: number): string {
  const text = String(source || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function humanizeDocumentationSlug(slug: string): string {
  return String(slug || "")
    .split(/[-/]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDocumentationDetailPath(sectionSlug: string, slug: string, routeBase = "/docs"): string {
  const base = String(routeBase || "/docs").replace(/\/$/, "") || "/docs";
  return sectionSlug === "root" ? `${base}/${slug}` : `${base}/${sectionSlug}/${slug}`;
}

export function renderDocumentationHtml(markdownRaw: string): string {
  const lines = String(markdownRaw || "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("```")) {
      const language = escapeHtml(trimmed.slice(3).trim());
      const codeLines: string[] = [];
      while (index + 1 < lines.length && !String(lines[index + 1] || "").trim().startsWith("```")) {
        index += 1;
        codeLines.push(lines[index] || "");
      }
      if (index + 1 < lines.length && String(lines[index + 1] || "").trim().startsWith("```")) index += 1;
      html.push(`<pre><code class="language-${language || "plain"}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2] || "")}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      html.push("<hr />");
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines = [trimmed.replace(/^>\s?/, "")];
      while (index + 1 < lines.length && String(lines[index + 1] || "").trim().startsWith(">")) {
        index += 1;
        quoteLines.push(String(lines[index] || "").trim().replace(/^>\s?/, ""));
      }
      html.push(`<blockquote><p>${renderInlineMarkdown(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    const bullet = trimmed.match(/^([-*])\s+(.*)$/);
    if (bullet) {
      const items = [bullet[2] || ""];
      while (index + 1 < lines.length) {
        const next = String(lines[index + 1] || "").trim();
        const nextBullet = next.match(/^([-*])\s+(.*)$/);
        if (!nextBullet) break;
        index += 1;
        items.push(nextBullet[2] || "");
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      const items = [ordered[1] || ""];
      while (index + 1 < lines.length) {
        const next = String(lines[index + 1] || "").trim();
        const nextOrdered = next.match(/^\d+\.\s+(.*)$/);
        if (!nextOrdered) break;
        index += 1;
        items.push(nextOrdered[1] || "");
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraphLines = [trimmed];
    while (index + 1 < lines.length) {
      const next = String(lines[index + 1] || "").trim();
      if (!next || /^(#{1,6})\s+/.test(next) || next.startsWith(">") || next.startsWith("```") || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || /^(-{3,}|\*{3,})$/.test(next)) {
        break;
      }
      index += 1;
      paragraphLines.push(next);
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(String(value || ""))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
