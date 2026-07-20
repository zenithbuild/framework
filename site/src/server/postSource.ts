import { blogPostContent } from "../content/index";
import { createDirectusServerClient, type DirectusServerClient } from "./directusClient";
import { loadGitBlogPosts } from "./gitBlogSource";
import {
  cleanText,
  decorateBlogHtml,
  defaultPostCta,
  deriveSummaryPoints,
  fallbackCategory,
  formatEditorialDate,
  formatReadingTime,
  mapTagRecords,
  normalizeCategory,
  normalizeImage,
  renderLocalSections,
  slugify,
  stripHtmlTags,
  toneByCategory,
  type BlogCategory,
  type BlogImage,
  type BlogTag,
} from "./postSourceSupport";
import { normalizeReadableSlug } from "../content/slugContract";
import { ContentValidationError, assertUniqueSlugs } from "./contentValidation";

type SourceMode = "git" | "local" | "directus";
type AccentTone = "red" | "blue" | "gold" | "magenta";

interface LocalBlogAuthor {
  name?: string;
  role?: string;
  href?: string;
}

interface LocalBlogCover {
  eyebrow?: string;
  title?: string;
  description?: string;
  tone?: AccentTone;
}

interface LocalBlogCta {
  eyebrow?: string;
  title?: string;
  description?: string;
  href?: string;
  label?: string;
}

interface LocalBlogRecord {
  slug: string;
  title: string;
  excerpt?: string;
  description?: string;
  publishedAt?: string;
  updatedAt?: string;
  readingTime?: string;
  tags?: string[];
  cover?: LocalBlogCover;
  author?: LocalBlogAuthor;
  summaryPoints?: string[];
  sections?: Array<Record<string, any>>;
  relatedSlugs?: string[];
  cta?: LocalBlogCta;
}

interface DirectusCategoryRecord {
  slug?: string | null;
  title?: string | null;
  route_base?: string | null;
}

interface DirectusFileRecord {
  id?: string | null;
  title?: string | null;
  filename_download?: string | null;
  width?: number | null;
  height?: number | null;
}

interface DirectusAuthorRecord {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface DirectusPostRecord {
  slug: string;
  title: string;
  excerpt?: string | null;
  description?: string | null;
  content?: string | null;
  published_at?: string | null;
  status?: string | null;
  author_name?: string | null;
  author_role?: string | null;
  author_href?: string | null;
  image?: DirectusFileRecord | string | null;
  author?: DirectusAuthorRecord | null;
  category_ref?: DirectusCategoryRecord | null;
  tags?: Array<{ tag?: { slug?: string | null; title?: string | null; color?: string | null; order?: number | null } | null; tags_id?: { slug?: string | null; title?: string | null; color?: string | null; order?: number | null } | null } | { slug?: string | null; title?: string | null; color?: string | null; order?: number | null }> | null;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  publishedAt: string | null;
  updatedAt: string | null;
  displayPublishedAt: string | null;
  displayUpdatedAt: string | null;
  readingTime: string;
  path: string;
  tags: string[];
  tagMeta: BlogTag[];
  category: BlogCategory;
  cover: {
    eyebrow: string;
    title: string;
    description: string;
    tone: AccentTone;
    image: BlogImage | null;
  };
  author: {
    name: string;
    role: string | null;
    href: string | null;
  };
  summaryPoints: string[];
  relatedSlugs: string[];
  htmlRendered: string;
  cta: {
    eyebrow: string;
    title: string;
    description: string;
    href: string;
    label: string;
  };
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  canonicalPath: string;
  headings: Array<{ id: string; text: string; level: number }>;
}

export function resolveBlogSourceMode(): SourceMode {
  const mode = (process.env.ZENITH_BLOG_SOURCE || "git").trim().toLowerCase();

  if (mode === "git" || mode === "local" || mode === "directus") {
    return mode;
  }

  throw new Error(`Unsupported ZENITH_BLOG_SOURCE "${mode}". Use "git", "local", or "directus".`);
}

export async function loadBlogIndexSource(): Promise<{
  featuredPost: BlogPost | null;
  archivePosts: BlogPost[];
  sourceMode: SourceMode;
}> {
  const posts = await loadBlogPosts();
  return {
    featuredPost: posts[0] || null,
    archivePosts: posts.slice(1),
    sourceMode: resolveBlogSourceMode(),
  };
}

export async function loadBlogDetailSource(slug: string): Promise<{
  blogPost: BlogPost | null;
  relatedPosts: BlogPost[];
  previousPost: BlogPost | null;
  nextPost: BlogPost | null;
  sourceMode: SourceMode;
}> {
  const posts = await loadBlogPosts();
  const blogPost = posts.find((entry) => entry.slug === slug) || null;
  const postIndex = blogPost ? posts.findIndex((entry) => entry.slug === blogPost.slug) : -1;

  if (!blogPost) {
    return {
      blogPost: null,
      relatedPosts: [],
      previousPost: null,
      nextPost: null,
      sourceMode: resolveBlogSourceMode(),
    };
  }

  return {
    blogPost,
    relatedPosts: resolveRelatedPosts(posts, blogPost),
    previousPost: postIndex > 0 ? posts[postIndex - 1] : null,
    nextPost: postIndex >= 0 && postIndex < posts.length - 1 ? posts[postIndex + 1] : null,
    sourceMode: resolveBlogSourceMode(),
  };
}

async function loadBlogPosts(): Promise<BlogPost[]> {
  const mode = resolveBlogSourceMode();
  const posts = mode === "git"
    ? await loadGitBlogPosts()
    : mode === "directus"
    ? await loadDirectusBlogPosts()
    : loadLocalBlogPosts();
  for (const post of posts) {
    if (!post.slug || normalizeReadableSlug(post.slug) !== post.slug) {
      throw new ContentValidationError(`Blog slug '${post.slug}' is not a canonical readable slug`);
    }
    if (post.path !== `/blog/${post.slug}` || post.canonicalPath !== post.path) {
      throw new ContentValidationError(`Blog '${post.slug}' must use canonical path /blog/${post.slug}`);
    }
  }
  assertUniqueSlugs(posts, "Blog");
  return posts;
}

async function loadDirectusBlogPosts(): Promise<BlogPost[]> {
  const client = await createDirectusServerClient();
  const records = await queryDirectusPostRecords(client);

  return records
    .map((record) => mapDirectusPostRecord(record, client.baseUrl))
    .filter((post): post is BlogPost => Boolean(post))
    .sort(compareBlogPosts);
}

async function queryDirectusPostRecords(client: DirectusServerClient): Promise<DirectusPostRecord[]> {
  return client.queryItems<DirectusPostRecord>("posts", {
    limit: -1,
    fields: [
      "slug",
      "title",
      "excerpt",
      "description",
      "content",
      "published_at",
      "status",
      "author_name",
      "author_role",
      "author_href",
      "image.id",
      "image.title",
      "image.filename_download",
      "image.width",
      "image.height",
      "author.first_name",
      "author.last_name",
      "category_ref.slug",
      "category_ref.title",
      "category_ref.route_base",
      "tags.tag.slug",
      "tags.tag.title",
      "tags.tag.color",
      "tags.tag.order",
      "tags.tags_id.slug",
      "tags.tags_id.title",
      "tags.tags_id.color",
      "tags.tags_id.order",
    ],
    sort: ["-published_at", "title"],
    query: {
      "filter[status][_eq]": "published",
    },
  });
}

function mapDirectusPostRecord(record: DirectusPostRecord, baseUrl: string): BlogPost | null {
  if (isVersionStyleSlug(record.slug)) {
    return null;
  }
  const category = normalizeCategory(record.category_ref) || { ...fallbackCategory };

  const htmlRendered = decorateBlogHtml(String(record.content || `<p>${escapeHtml(record.description || record.title)}</p>`));
  const excerpt = cleanText(record.excerpt || record.description || record.title);
  const description = cleanText(record.description || excerpt || record.title);
  const tagMeta = mapTagRecords(record.tags);
  const tags = tagMeta.map((tag) => tag.title);
  const image = normalizeImage(record.image, baseUrl, record.title);
  const tone = toneByCategory[category.slug] || "blue";
  const authorName = cleanText(record.author_name || formatDirectusAuthor(record.author) || "Zenith Team");
  const authorRole = cleanText(record.author_role || category.title) || null;
  const authorHref = cleanText(record.author_href || "") || null;

  return {
    slug: record.slug,
    title: record.title,
    excerpt,
    description,
    publishedAt: record.published_at || null,
    updatedAt: null,
    displayPublishedAt: formatEditorialDate(record.published_at),
    displayUpdatedAt: null,
    readingTime: formatReadingTime(stripHtmlTags(record.content || description)),
    path: `/blog/${record.slug}`,
    tags,
    tagMeta,
    category,
    cover: {
      eyebrow: category.title,
      title: record.title,
      description: excerpt,
      tone,
      image,
    },
    author: {
      name: authorName,
      role: authorRole,
      href: authorHref,
    },
    summaryPoints: deriveSummaryPoints(htmlRendered, excerpt, tags),
    relatedSlugs: [],
    htmlRendered,
    cta: defaultPostCta(category),
    featured: false,
    seoTitle: record.title,
    seoDescription: description,
    canonicalPath: `/blog/${record.slug}`,
    headings: [],
  };
}

function loadLocalBlogPosts(): BlogPost[] {
  const records = Array.isArray(blogPostContent.posts)
    ? (blogPostContent.posts as LocalBlogRecord[])
    : [];

  return [...records]
    .filter((record) => !/^v?\d+-\d+-\d+$/.test(record.slug))
    .sort(compareLocalRecords)
    .map((record) => mapLocalBlogRecord(record));
}

function mapLocalBlogRecord(record: LocalBlogRecord): BlogPost {
  const category = inferLocalCategory(record);
  const htmlRendered = decorateBlogHtml(renderLocalSections(record));
  const tagMeta = (record.tags || []).map((tag, index) => ({
    slug: slugify(tag),
    title: tag,
    color: null,
    order: index,
  }));

  return {
    slug: record.slug,
    title: record.title,
    excerpt: cleanText(record.excerpt || record.description || record.title),
    description: cleanText(record.description || record.excerpt || record.title),
    publishedAt: record.publishedAt || null,
    updatedAt: record.updatedAt || null,
    displayPublishedAt: formatEditorialDate(record.publishedAt),
    displayUpdatedAt: formatEditorialDate(record.updatedAt),
    readingTime: record.readingTime || formatReadingTime(stripHtmlTags(htmlRendered)),
    path: `/blog/${record.slug}`,
    tags: tagMeta.map((tag) => tag.title),
    tagMeta,
    category,
    cover: {
      eyebrow: record.cover?.eyebrow || category.title,
      title: record.cover?.title || record.title,
      description: record.cover?.description || cleanText(record.excerpt || record.description || record.title),
      tone: record.cover?.tone || toneByCategory[category.slug] || "blue",
      image: null,
    },
    author: {
      name: cleanText(record.author?.name || "Zenith Team"),
      role: cleanText(record.author?.role || category.title),
      href: record.author?.href || null,
    },
    summaryPoints: Array.isArray(record.summaryPoints) ? [...record.summaryPoints] : deriveSummaryPoints(htmlRendered, cleanText(record.excerpt || record.description || record.title), tagMeta.map((tag) => tag.title)),
    relatedSlugs: Array.isArray(record.relatedSlugs) ? [...record.relatedSlugs] : [],
    htmlRendered,
    cta: {
      eyebrow: record.cta?.eyebrow || "Keep moving",
      title: record.cta?.title || "Open the next surface.",
      description: record.cta?.description || "Keep the journal, changelog, and docs explicit instead of blending them together.",
      href: record.cta?.href || "/docs",
      label: record.cta?.label || "Open docs",
    },
    featured: false,
    seoTitle: record.title,
    seoDescription: cleanText(record.description || record.excerpt || record.title),
    canonicalPath: `/blog/${record.slug}`,
    headings: [],
  };
}

function compareLocalRecords(left: LocalBlogRecord, right: LocalBlogRecord) {
  const leftTime = Date.parse(left.publishedAt || "");
  const rightTime = Date.parse(right.publishedAt || "");

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return left.slug.localeCompare(right.slug);
}

function compareBlogPosts(left: BlogPost, right: BlogPost) {
  const leftTime = Date.parse(left.publishedAt || "");
  const rightTime = Date.parse(right.publishedAt || "");

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return left.slug.localeCompare(right.slug);
}

function resolveRelatedPosts(posts: BlogPost[], currentPost: BlogPost) {
  const explicit = currentPost.relatedSlugs
    .map((slug) => posts.find((post) => post.slug === slug))
    .filter((post): post is BlogPost => Boolean(post && post.slug !== currentPost.slug));

  if (explicit.length >= 2) {
    return explicit.slice(0, 2);
  }

  const ranked = posts
    .filter((post) => post.slug !== currentPost.slug && !explicit.some((entry) => entry.slug === post.slug))
    .map((post) => ({
      post,
      score: sharedTagScore(post, currentPost) + (post.category.slug === currentPost.category.slug ? 2 : 0),
    }))
    .sort((left, right) => right.score - left.score || compareBlogPosts(left.post, right.post))
    .map((entry) => entry.post);

  return [...explicit, ...ranked].slice(0, 2);
}

function sharedTagScore(left: BlogPost, right: BlogPost) {
  const leftTags = new Set(left.tags.map((tag) => tag.toLowerCase()));
  return right.tags.reduce((score, tag) => score + (leftTags.has(tag.toLowerCase()) ? 1 : 0), 0);
}

function inferLocalCategory(record: LocalBlogRecord): BlogCategory {
  const slug = record.slug === "release-0-6-18" ? "releases" : "engineering";
  const title = slug === "releases" ? "Releases" : "Engineering";
  return { slug, title, routeBase: "/blog" };
}

function formatDirectusAuthor(author: DirectusAuthorRecord | null | undefined) {
  const name = [author?.first_name, author?.last_name].filter(Boolean).join(" ").trim();
  return name || author?.email || "";
}

function isVersionStyleSlug(slug: string | null | undefined) {
  return /^v\d+-\d+-\d+$/.test(cleanText(slug));
}
