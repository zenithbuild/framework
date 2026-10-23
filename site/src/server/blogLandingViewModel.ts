import type { BlogPost } from "./postSource";

export interface BlogLandingBrowseModel {
  articles: BlogPost[];
  categories: string[];
  tags: string[];
}

function cleanLabel(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueLabels(values: string[]) {
  const labels = new Map<string, string>();
  for (const value of values) {
    const label = cleanLabel(value);
    const key = label.toLowerCase();
    if (label && !labels.has(key)) labels.set(key, label);
  }
  return [...labels.values()].sort((left, right) => left.localeCompare(right));
}

export function createBlogLandingBrowseModel(
  featuredPost: BlogPost | null,
  archivePosts: BlogPost[],
): BlogLandingBrowseModel {
  const seen = new Set<string>();
  const articles = [featuredPost, ...archivePosts].filter((post): post is BlogPost => {
    if (!post || seen.has(post.slug)) return false;
    seen.add(post.slug);
    return true;
  });

  return {
    articles,
    categories: uniqueLabels(articles.map((post) => post.category.title)),
    tags: uniqueLabels(articles.flatMap((post) => post.tags)).slice(0, 12),
  };
}
