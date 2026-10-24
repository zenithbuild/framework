type AccentTone = "red" | "blue" | "gold" | "magenta";

export interface BlogCategory {
  slug: string;
  title: string;
  routeBase: string;
}

export interface BlogTag {
  slug: string;
  title: string;
  color: string | null;
  order: number | null;
}

export interface BlogImage {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export const editorialDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export const toneByCategory: Record<string, AccentTone> = {
  announcements: "magenta",
  engineering: "red",
  guides: "blue",
  releases: "gold",
};

export function defaultPostCta(category: BlogCategory) {
  if (category.slug === "releases") {
    return {
      eyebrow: "Open the release line",
      title: "Jump to the versioned changelog.",
      description: "The journal explains the move. The changelog records the shipped release history.",
      href: "/changelog",
      label: "Open changelog",
    };
  }

  return {
    eyebrow: "Open the contract",
    title: "Follow the journal into the docs.",
    description: "The post explains the reasoning. The docs lock the actual framework contract.",
    href: "/docs",
    label: "Open docs",
  };
}

export function deriveSummaryPoints(html: string, excerpt: string, tags: string[]) {
  const bullets = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gi)]
    .map((match) => cleanText(stripHtmlTags(match[1] || "")))
    .filter(Boolean);
  if (bullets.length >= 3) {
    return bullets.slice(0, 3);
  }

  const headings = [...html.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi)]
    .map((match) => cleanText(stripHtmlTags(match[1] || "")))
    .filter(Boolean);
  if (headings.length >= 3) {
    return headings.slice(0, 3);
  }

  const fallback = [excerpt, ...tags.map((tag) => `${tag} focus`)].map(cleanText).filter(Boolean);
  return fallback.slice(0, 3);
}

export function renderLocalSections(record: { sections?: Array<Record<string, any>>; description?: string; excerpt?: string; title?: string }) {
  const sections = record.sections || [];
  if (sections.length === 0) {
    return `<p>${escapeHtml(cleanText(record.description || record.excerpt || record.title || ""))}</p>`;
  }

  return sections
    .map((section) => {
      if (section.type === "quote") {
        return `<section><blockquote><p>${escapeHtml(section.quote || "")}</p>${section.attribution ? `<footer>${escapeHtml(section.attribution)}</footer>` : ""}</blockquote></section>`;
      }

      if (section.type === "points") {
        const items = (section.items || [])
          .map((item: Record<string, any>) => `<li><strong>${escapeHtml(item.title || "")}</strong> ${escapeHtml(item.description || "")}</li>`)
          .join("");

        return `<section>${section.eyebrow ? `<p>${escapeHtml(section.eyebrow)}</p>` : ""}${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}${section.intro ? `<p>${escapeHtml(section.intro)}</p>` : ""}<ul>${items}</ul></section>`;
      }

      const paragraphs = (section.paragraphs || [])
        .map((paragraph: string) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");

      return `<section>${section.eyebrow ? `<p>${escapeHtml(section.eyebrow)}</p>` : ""}${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}${paragraphs}</section>`;
    })
    .join("");
}

export function decorateBlogHtml(html: string) {
  return html
    .replace(/<h1([^>]*) class="scroll-mt-28">/g, '<h1$1 class="scroll-mt-28 font-display text-[clamp(2.6rem,4vw,4.2rem)] leading-[0.94] tracking-tight text-foreground">')
    .replace(/<h2([^>]*) class="scroll-mt-28">/g, '<h2$1 class="scroll-mt-28 mt-12 font-display text-[clamp(1.9rem,3vw,3.1rem)] leading-[0.96] tracking-tight text-foreground first:mt-0">')
    .replace(/<h3([^>]*) class="scroll-mt-28">/g, '<h3$1 class="scroll-mt-28 mt-8 font-display text-[clamp(1.35rem,2.2vw,1.95rem)] leading-tight text-foreground">')
    .replace(/<h1>/g, '<h1 class="font-display text-[clamp(2.6rem,4vw,4.2rem)] leading-[0.94] tracking-tight text-foreground">')
    .replace(/<h2>/g, '<h2 class="mt-12 font-display text-[clamp(1.9rem,3vw,3.1rem)] leading-[0.96] tracking-tight text-foreground first:mt-0">')
    .replace(/<h3>/g, '<h3 class="mt-8 font-display text-[clamp(1.35rem,2.2vw,1.95rem)] leading-tight text-foreground">')
    .replace(/<p>/g, '<p class="mt-5 text-base leading-8 text-muted-foreground first:mt-0">')
    .replace(/<ul>/g, '<ul class="mt-5 list-disc space-y-3 pl-6 text-base leading-8 text-muted-foreground">')
    .replace(/<ol>/g, '<ol class="mt-5 list-decimal space-y-3 pl-6 text-base leading-8 text-muted-foreground">')
    .replace(/<li>/g, '<li class="pl-1">')
    .replace(/<pre>/g, '<pre class="mt-6 overflow-x-auto rounded-[1.5rem] border border-border/70 bg-card/80 p-5 text-sm leading-7 text-foreground">')
    .replace(/<code>/g, '<code class="font-mono text-[0.92em]">')
    .replace(/<blockquote>/g, '<blockquote class="mt-8 rounded-[1.75rem] border-l-4 border-surface-border-red bg-surface-red/35 px-6 py-5">')
    .replace(/<a /g, '<a class="font-medium text-foreground underline decoration-border underline-offset-4" ');
}

export function formatEditorialDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return editorialDateFormatter.format(parsed);
}

export function formatReadingTime(text: string) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(wordCount / 220));
  return `${minutes} min read`;
}

export function humanizeSlug(value: string) {
  return cleanText(value.replace(/[-_]+/g, " "));
}

export function slugify(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripHtmlTags(value: string) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

export function renderBlogHeadingLinks(headings: Array<{ id: string; text: string }>) {
  return headings.map((heading) => {
    const id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(heading.id) ? heading.id : "section";
    return `<a href="#${id}" class="border-l border-border py-2 pl-4 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground">${escapeHtml(heading.text)}</a>`;
  }).join("");
}
