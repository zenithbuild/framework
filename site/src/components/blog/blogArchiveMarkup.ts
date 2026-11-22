interface ArchivePost {
  title: string;
  excerpt: string;
  path: string;
  author: { name: string };
  category: { title: string };
  tags: string[];
  publishedAt: string | null;
  displayPublishedAt: string | null;
  readingTime: string | null;
}

function escapeHtml(value: string | null | undefined): string {
  return (value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function featuredTags(tags: string[]): string {
  return tags.map((tag) => `<li class="rounded-full bg-brand-gold-soft px-3 py-1 font-mono text-xs text-foreground">${escapeHtml(tag)}</li>`).join("");
}

export function archiveCategories(categories: string[], current: string): string {
  return categories.map((label) => {
    const active = label === current;
    const color = active ? "bg-foreground text-background" : "border border-border-strong bg-background text-foreground";
    const safeLabel = escapeHtml(label);
    const href = label === "All" ? "/blog" : "/blog?category=" + encodeURIComponent(label);
    const currentPage = active ? ' aria-current="page"' : "";
    return `<a href="${href}" data-zen-link="true" data-category="${safeLabel}"${currentPage} class="v1-button px-4 ${color}">${safeLabel}</a>`;
  }).join("");
}

export function matchingPosts(posts: ArchivePost[], category: string, tag: string): ArchivePost[] {
  return posts.filter((post) => (category === "All" || post.category.title === category)
    && (tag === "All" || post.tags.includes(tag)));
}

export function archiveRows(posts: ArchivePost[], category: string, tag: string): string {
  return matchingPosts(posts, category, tag).map((post) => `
    <article data-blog-article-row="true" data-blog-category="${escapeHtml(post.category.title)}" class="border-b border-border">
      <a href="${escapeHtml(post.path)}" data-zen-link="true" class="group grid min-w-0 gap-3 rounded-sm py-5 v1-focus md:grid-cols-[minmax(110px,176px)_minmax(0,1fr)_auto] md:gap-6 md:py-7">
        <time datetime="${escapeHtml(post.publishedAt)}" class="font-mono text-xs leading-5 text-muted-foreground">${escapeHtml(post.displayPublishedAt)}</time>
        <div class="min-w-0">
          <h3 class="font-heading text-xl font-semibold leading-7 text-foreground group-hover:underline">${escapeHtml(post.title)}</h3>
          <p class="mt-2 max-w-[64ch] text-sm leading-6 text-muted-foreground">${escapeHtml(post.excerpt)}</p>
          <p class="mt-2 text-xs text-muted-foreground">By ${escapeHtml(post.author.name)}</p>
          <span class="mt-2 block break-all font-mono text-xs text-muted-foreground">${escapeHtml(post.path)}</span>
        </div>
        <div class="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
          <span class="rounded-full bg-brand-blue-soft px-3 py-1 font-mono text-xs text-foreground">${escapeHtml(post.category.title)}</span>
          <span class="font-mono text-xs leading-6 text-muted-foreground">${escapeHtml(post.readingTime)}</span>
        </div>
      </a>
    </article>`).join("");
}
