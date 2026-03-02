import MarkdownIt from "markdown-it";
import path from "node:path";

const markdown = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false
});

export interface CmsBodyEntry {
    body_md?: unknown;
    body_mdx?: unknown;
    body_html?: unknown;
    mdx?: unknown;
    content?: unknown;
}

export type DocsDemoRenderEntry = {
    id: string;
    name: string;
    route: string;
    height: number;
    contracts: string[];
};

interface CompileOptions {
    mdxEnabled?: boolean;
    demoRegistry?: Map<string, DocsDemoRenderEntry>;
    sourcePath?: string;
    strictDemoShortcodes?: boolean;
}

interface NormalizedBody {
    bodyMd: string;
    bodyMdx: string;
    bodyHtml: string;
}

function stripDangerousHtml(rawHtml: string): string {
    return rawHtml
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"');
}

function splitHref(inputHref: string): { pathPart: string; suffix: string } {
    const href = String(inputHref || "").trim();
    const match = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    if (!match) {
        return { pathPart: href, suffix: "" };
    }
    return {
        pathPart: match[1] || "",
        suffix: `${match[2] || ""}${match[3] || ""}`
    };
}

function removeMarkdownExt(pathPart: string): string {
    return pathPart.replace(/\.(md|mdx)$/i, "");
}

function canonicalDocsHrefFromPath(pathPart: string): string {
    const normalized = String(pathPart || "").replace(/\\/g, "/");
    const trimmed = normalized.startsWith("/") ? normalized.slice(1) : normalized;
    const withoutPrefix = trimmed.startsWith("documentation/") ? trimmed.slice("documentation/".length) : trimmed;
    const slug = removeMarkdownExt(withoutPrefix).replace(/^\/+|\/+$/g, "");
    return slug ? `/docs/${slug}` : "/docs";
}

function resolveInternalDocsHref(rawHref: string, sourcePath: string): string {
    const href = String(rawHref || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("?")) {
        return href;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith("//")) {
        return href;
    }

    const { pathPart, suffix } = splitHref(href);
    if (!pathPart) {
        return href;
    }

    if (pathPart.startsWith("/docs/")) {
        const canonical = removeMarkdownExt(pathPart);
        return `${canonical}${suffix}`;
    }

    if (pathPart.startsWith("/documentation/")) {
        return `${canonicalDocsHrefFromPath(pathPart)}${suffix}`;
    }

    if (pathPart.startsWith("documentation/")) {
        return `${canonicalDocsHrefFromPath(pathPart)}${suffix}`;
    }

    const baseSource = String(sourcePath || "").replace(/\\/g, "/");
    const baseDir = baseSource ? path.posix.dirname(baseSource) : "documentation";

    const isRelativeLike = pathPart.startsWith("./") || pathPart.startsWith("../");
    const hasMarkdownExt = /\.(md|mdx)$/i.test(pathPart);
    const looksLocalDoc = isRelativeLike || hasMarkdownExt;
    if (!looksLocalDoc) {
        return href;
    }

    const resolved = pathPart.startsWith("/")
        ? pathPart.slice(1)
        : path.posix.normalize(path.posix.join(baseDir, pathPart));
    const normalized = resolved.replace(/^\/+/, "");
    if (!normalized.startsWith("documentation/")) {
        return href;
    }
    if (normalized.startsWith("documentation/_legacy/") || normalized.includes("/_legacy/")) {
        return href;
    }

    return `${canonicalDocsHrefFromPath(normalized)}${suffix}`;
}

function rewriteInternalDocLinks(rawHtml: string, sourcePath: string): string {
    if (!sourcePath) {
        return rawHtml;
    }
    return rawHtml.replace(
        /<a\b([^>]*?)\shref=(["'])([^"']+)\2([^>]*)>/gi,
        (_all, before, quote, hrefRaw, after) => {
            const rewritten = resolveInternalDocsHref(String(hrefRaw || ""), sourcePath);
            return `<a${before} href=${quote}${escapeHtml(rewritten)}${quote}${after}>`;
        }
    );
}

function escapeZenithBraces(rawHtml: string): string {
    return rawHtml.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

function escapeZenithSpecifiers(rawHtml: string): string {
    return rawHtml
        .replace(/\.zen\b/g, "&#46;zen")
        .replace(/zenith:/g, "zenith&#58;")
        .replace(/\bimport\s+/g, "import&#32;")
        .replace(/\bimport\(/g, "import&#40;")
        .replace(/\bfrom\s+(['"])/g, "from&#32;$1")
        .replace(/\brequire\(/g, "require&#40;")
        .replace(/\bexport\s+/g, "export&#32;");
}

function escapeHtml(value: string): string {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function replaceDemoShortcodes(
    rawHtml: string,
    demoRegistry: Map<string, DocsDemoRenderEntry> | undefined,
    options: { strict: boolean },
): string {
    const renderDemoEmbed = (demoIdRaw: string): string => {
        const demoId = String(demoIdRaw || "").trim();
        if (!demoRegistry || !demoRegistry.has(demoId)) {
            if (options.strict) {
                throw new Error(`Unknown docs demo id: ${demoId}`);
            }
            return `<div class="docs-demo docs-demo--error"><p>Demo unavailable: ${escapeHtml(demoId)}</p></div>`;
        }

        const demo = demoRegistry.get(demoId)!;
        const height = Number.isFinite(demo.height) ? Math.max(180, Math.min(900, demo.height)) : 360;
        const contracts = demo.contracts.length > 0
            ? `<p class="docs-demo-contracts">Contracts: ${escapeHtml(demo.contracts.join(", "))}</p>`
            : "";

        return [
            `<figure class="docs-demo" data-demo-id="${escapeHtml(demo.id)}">`,
            `  <iframe class="docs-demo-frame" src="${escapeHtml(demo.route)}" loading="lazy" title="${escapeHtml(demo.name)} demo" style="width:100%;height:${height}px;border:1px solid rgba(127,127,127,0.35);border-radius:12px;background:#fff;"></iframe>`,
            `  <figcaption class="docs-demo-caption"><strong>${escapeHtml(demo.name)}</strong>${contracts}</figcaption>`,
            `</figure>`,
        ].join("");
    };

    // MarkdownIt renders unknown directives inside a paragraph with escaped quotes.
    const paragraphPattern = /<p>\s*:::demo\s+id\s*=\s*(?:"|&quot;)([a-zA-Z0-9_-]+)(?:"|&quot;)\s*:::\s*<\/p>/gim;
    const inlinePattern = /:::demo\s+id\s*=\s*(?:"|&quot;)([a-zA-Z0-9_-]+)(?:"|&quot;)\s*:::/gim;

    return rawHtml
        .replace(paragraphPattern, (_all, demoIdRaw) => renderDemoEmbed(demoIdRaw))
        .replace(inlinePattern, (_all, demoIdRaw) => renderDemoEmbed(demoIdRaw));
}

function toText(value: unknown): string {
    return String(value ?? "").trim();
}

function stripMdxDirectives(source: string): string {
    const lines = source.split("\n");
    const output: string[] = [];

    let strippingTag = "";
    let strippingSelfClosing = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (!strippingTag) {
            if (/^(import|export)\s/.test(trimmed)) {
                continue;
            }

            const openMatch = trimmed.match(/^<([A-Z][\w.]*)\b/);
            if (openMatch) {
                strippingTag = openMatch[1];
                strippingSelfClosing = true;

                if (trimmed.includes("/>") || trimmed.includes(`</${strippingTag}>`)) {
                    strippingTag = "";
                    strippingSelfClosing = false;
                }
                continue;
            }

            output.push(line);
            continue;
        }

        if (line.includes(`</${strippingTag}>`)) {
            strippingTag = "";
            strippingSelfClosing = false;
            continue;
        }
        if (strippingSelfClosing && line.includes("/>")) {
            strippingTag = "";
            strippingSelfClosing = false;
            continue;
        }
    }

    return output.join("\n");
}

function normalizeBodyFields(entry: CmsBodyEntry): NormalizedBody {
    return {
        bodyMd: toText(entry.body_md),
        bodyMdx: toText(entry.body_mdx || entry.mdx),
        bodyHtml: toText(entry.body_html || entry.content)
    };
}

export function compileCmsBody(entry: CmsBodyEntry, options: CompileOptions = {}): string {
    const { bodyMd, bodyMdx, bodyHtml } = normalizeBodyFields(entry);
    const mdxEnabled = options.mdxEnabled === true;
    const strictDemoShortcodes = options.strictDemoShortcodes === true;

    if (!bodyMd && !bodyMdx && !bodyHtml) {
        return "<p>Content is not available yet.</p>";
    }

    let rendered = "";
    if (bodyMd) {
        rendered = markdown.render(bodyMd);
    } else if (bodyMdx) {
        if (!mdxEnabled) {
            throw new Error(
                "MDX content was provided, but CMS MDX support is disabled. Enable directus.enableMdx in .zenithrc.json or provide body_md."
            );
        }
        rendered = markdown.render(stripMdxDirectives(bodyMdx));
    } else {
        rendered = bodyHtml;
    }

    const rewritten = rewriteInternalDocLinks(rendered, String(options.sourcePath || ""));
    const safe = stripDangerousHtml(rewritten);
    const withDemos = replaceDemoShortcodes(safe, options.demoRegistry, {
        strict: strictDemoShortcodes
    });
    const escapedSpecifiers = escapeZenithSpecifiers(withDemos);
    return escapeZenithBraces(escapedSpecifiers);
}
