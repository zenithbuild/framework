import { Marked, Renderer, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";
import { normalizeReadableSlug } from "../content/slugContract";

export interface DocumentationHeading {
  id: string;
  text: string;
  level: number;
}

export interface RenderedDocumentationMarkdown {
  html: string;
  headings: DocumentationHeading[];
}

export function renderDocumentationMarkdown(markdown: string, documentTitle = ""): RenderedDocumentationMarkdown {
  const headings: DocumentationHeading[] = [];
  const headingCounts = new Map<string, number>();
  const renderer = new Renderer();
  let titleHeadingRemoved = false;

  renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = String(lang || "text").trim().split(/\s+/, 1)[0].toLowerCase();
    const safeLanguage = /^[a-z0-9_+-]+$/.test(language) ? language : "text";
    return `<pre data-language="${safeLanguage}"><code class="language-${safeLanguage}">${escapeHtml(text)}</code></pre>\n`;
  };

  renderer.heading = function ({ tokens, depth }: Tokens.Heading) {
    const renderedText = this.parser.parseInline(tokens);
    const text = stripInlineMarkup(renderedText);
    if (
      depth === 1
      && !titleHeadingRemoved
      && text.localeCompare(documentTitle, undefined, { sensitivity: "base" }) === 0
    ) {
      titleHeadingRemoved = true;
      return "";
    }
    const baseId = stableDocumentationHeadingId(text);
    const count = headingCounts.get(baseId) || 0;
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
    headingCounts.set(baseId, count + 1);
    if (depth === 2 || depth === 3) headings.push({ id, text, level: depth });
    return `<h${depth} id="${id}" class="scroll-mt-28">${renderedText}</h${depth}>\n`;
  };

  renderer.link = function ({ href, title, tokens }: Tokens.Link) {
    const label = this.parser.parseInline(tokens);
    if (!isSafeDocumentationUrl(href)) return label;
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(href)}"${titleAttribute}>${label}</a>`;
  };

  renderer.image = ({ href, title, text }: Tokens.Image) => {
    if (!isSafeDocumentationUrl(href)) return escapeHtml(text);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy">`;
  };

  renderer.html = ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text);

  const parser = new Marked({ gfm: true, breaks: false, renderer });
  const rendered = parser.parse(String(markdown || ""));
  if (typeof rendered !== "string") {
    throw new Error("Documentation Markdown rendering unexpectedly became asynchronous");
  }

  return {
    html: sanitizeDocumentationHtml(rendered),
    headings,
  };
}

export function stableDocumentationHeadingId(value: string): string {
  return normalizeReadableSlug(value) || "section";
}

export function isSafeDocumentationUrl(value: string): boolean {
  const url = String(value || "").trim();
  if (!url || /[\u0000-\u001f\u007f<>"']/.test(url)) return false;
  if (/^(?:https?:|mailto:)/i.test(url)) return true;
  if (/^#[-a-z0-9_:.]+$/i.test(url)) return true;
  if (/^\/(?!\/)/.test(url)) return !url.includes("..");
  return /^(?![a-z][a-z0-9+.-]*:)(?!\/\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s]+$/i.test(url);
}

function sanitizeDocumentationHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [
      "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
      "hr", "img", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      code: ["class"],
      h1: ["id", "class"],
      h2: ["id", "class"],
      h3: ["id", "class"],
      h4: ["id", "class"],
      h5: ["id", "class"],
      h6: ["id", "class"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      ol: ["start"],
      pre: ["data-language"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  });
}

function stripInlineMarkup(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
