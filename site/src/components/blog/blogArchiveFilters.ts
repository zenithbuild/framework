export const BLOG_ALL_FILTER = "All";

interface BlogFilterArticle {
  category?: { title?: string };
  tags: string[];
}

function cleanBlogFilterLabel(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedBlogFilterLabel(value: string | null | undefined) {
  return cleanBlogFilterLabel(value).toLowerCase();
}

export function filterBlogArticles<T extends BlogFilterArticle>(
  articles: T[],
  category = BLOG_ALL_FILTER,
  tag = BLOG_ALL_FILTER,
) {
  const categoryKey = normalizedBlogFilterLabel(category);
  const tagKey = normalizedBlogFilterLabel(tag);
  const allKey = normalizedBlogFilterLabel(BLOG_ALL_FILTER);

  return articles.filter((article) => {
    const categoryMatches = categoryKey === allKey
      || normalizedBlogFilterLabel(article.category?.title) === categoryKey;
    const tagMatches = tagKey === allKey
      || article.tags.some((articleTag) => normalizedBlogFilterLabel(articleTag) === tagKey);
    return categoryMatches && tagMatches;
  });
}

export function describeBlogArchiveFilters(
  category = BLOG_ALL_FILTER,
  tag = BLOG_ALL_FILTER,
) {
  const categoryActive = normalizedBlogFilterLabel(category) !== normalizedBlogFilterLabel(BLOG_ALL_FILTER);
  const tagActive = normalizedBlogFilterLabel(tag) !== normalizedBlogFilterLabel(BLOG_ALL_FILTER);

  if (categoryActive && tagActive) return `${cleanBlogFilterLabel(category)} · ${cleanBlogFilterLabel(tag)}`;
  if (categoryActive) return cleanBlogFilterLabel(category);
  if (tagActive) return `Tagged “${cleanBlogFilterLabel(tag)}”`;
  return "All articles";
}
