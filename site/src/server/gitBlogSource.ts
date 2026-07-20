import { readdir, readFile } from "node:fs/promises";
import matter from "gray-matter";
import type { BlogPost } from "./postSource";
import {
  cleanText,
  decorateBlogHtml,
  defaultPostCta,
  deriveSummaryPoints,
  formatEditorialDate,
  formatReadingTime,
  slugify,
  stripHtmlTags,
  toneByCategory,
} from "./postSourceSupport";
import { renderDocumentationMarkdown } from "./documentationMarkdown";
import { safePublicUrl } from "./contentValidation";
import { normalizeReadableSlug } from "../content/slugContract";

const BLOG_DIRECTORY = new URL("../content/blog/", import.meta.url);
const PEOPLE_DIRECTORY = new URL("../content/people/", import.meta.url);
const AUTHOR_REFERENCE = /^site\/src\/content\/people\/([a-z0-9-]+)\.json$/;

interface GitBlogFrontmatter {
  title?: unknown;
  description?: unknown;
  published?: unknown;
  publishedAt?: unknown;
  updatedAt?: unknown;
  author?: unknown;
  category?: unknown;
  tags?: unknown;
  featured?: unknown;
  featuredImage?: unknown;
  seoTitle?: unknown;
  seoDescription?: unknown;
  canonicalPath?: unknown;
  relatedSlugs?: unknown;
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const normalized = cleanText(String(entry || ""));
    if (!normalized || normalized.length > 80 || seen.has(normalized.toLowerCase())) return [];
    seen.add(normalized.toLowerCase());
    return [normalized];
  });
}

async function resolveAuthor(reference: unknown, categoryTitle: string) {
  const path = cleanText(String(reference || ""));
  const match = path.match(AUTHOR_REFERENCE);
  if (!match) return { name: "Zenith Team", role: categoryTitle, href: null };
  try {
    const record = JSON.parse(await readFile(new URL(`${match[1]}.json`, PEOPLE_DIRECTORY), "utf8")) as Record<string, unknown>;
    const name = cleanText(String(record.name || "")) || "Zenith Team";
    return { name, role: categoryTitle, href: safePublicUrl(record.profileUrl, false) };
  } catch {
    return { name: "Zenith Team", role: categoryTitle, href: null };
  }
}

function normalizeImage(value: unknown, title: string) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const url = safePublicUrl(input.src, true);
  const width = Number(input.width);
  const height = Number(input.height);
  if (!url || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return { url, width, height, alt: cleanText(String(input.alt || "")) || title };
}

function validDate(value: unknown): string | null {
  const normalized = cleanText(String(value || ""));
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : null;
}

async function mapGitBlogFile(filename: string): Promise<BlogPost | null> {
  const slug = filename.replace(/\.md$/, "");
  if (!slug || normalizeReadableSlug(slug) !== slug) {
    throw new Error(`site/src/content/blog/${filename}: filename must be a canonical readable slug`);
  }
  const parsed = matter(await readFile(new URL(filename, BLOG_DIRECTORY), "utf8"));
  const fields = parsed.data as GitBlogFrontmatter;
  if (fields.published !== true) return null;
  const title = cleanText(String(fields.title || ""));
  const description = cleanText(String(fields.description || ""));
  const publishedAt = validDate(fields.publishedAt);
  if (!title || !description || !publishedAt || !parsed.content.trim()) return null;

  const canonicalPath = cleanText(String(fields.canonicalPath || "")) || `/blog/${slug}`;
  if (canonicalPath !== `/blog/${slug}`) {
    throw new Error(`site/src/content/blog/${filename}: canonicalPath must equal /blog/${slug}`);
  }
  const categoryTitle = cleanText(String(fields.category || "")) || "Engineering";
  const categorySlug = slugify(categoryTitle) || "engineering";
  const category = { slug: categorySlug, title: categoryTitle, routeBase: "/blog" };
  const tags = safeArray(fields.tags);
  const rendered = renderDocumentationMarkdown(parsed.content, title);
  const htmlRendered = decorateBlogHtml(rendered.html);
  const author = await resolveAuthor(fields.author, categoryTitle);
  const tagMeta = tags.map((tag, order) => ({ slug: slugify(tag), title: tag, color: null, order }));
  const excerpt = description;

  return {
    slug,
    title,
    excerpt,
    description,
    publishedAt,
    updatedAt: validDate(fields.updatedAt),
    displayPublishedAt: formatEditorialDate(publishedAt),
    displayUpdatedAt: formatEditorialDate(validDate(fields.updatedAt)),
    readingTime: formatReadingTime(stripHtmlTags(htmlRendered)),
    path: `/blog/${slug}`,
    tags,
    tagMeta,
    category,
    cover: {
      eyebrow: categoryTitle,
      title,
      description,
      tone: toneByCategory[categorySlug] || "blue",
      image: normalizeImage(fields.featuredImage, title),
    },
    author,
    summaryPoints: deriveSummaryPoints(htmlRendered, excerpt, tags),
    relatedSlugs: safeArray(fields.relatedSlugs).filter((entry) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry)),
    htmlRendered,
    cta: defaultPostCta(category),
    featured: fields.featured === true,
    seoTitle: cleanText(String(fields.seoTitle || "")) || title,
    seoDescription: cleanText(String(fields.seoDescription || "")) || description,
    canonicalPath,
    headings: rendered.headings,
  };
}

export async function loadGitBlogPosts(): Promise<BlogPost[]> {
  const filenames = (await readdir(BLOG_DIRECTORY)).filter((name) => name.endsWith(".md")).sort();
  const records = (await Promise.all(filenames.map(mapGitBlogFile))).filter((record): record is BlogPost => Boolean(record));
  return records.sort((left, right) => {
    if (left.featured !== right.featured) return Number(right.featured) - Number(left.featured);
    const dateOrder = Date.parse(right.publishedAt || "") - Date.parse(left.publishedAt || "");
    return dateOrder || left.slug.localeCompare(right.slug);
  });
}
