export type View =
    | "home"
    | "about"
    | "blog-list"
    | "blog-post"
    | "docs-index"
    | "docs-page"
    | "not-found";

export type BlogSummary = {
    slug: string;
    title: string;
    excerpt?: string;
    publishedAt?: string;
    updatedAt?: string;
};

export type BlogPost = {
    slug: string;
    title: string;
    html?: string;
    publishedAt?: string;
    updatedAt?: string;
};

export type DocNavItem = {
    path: string; // "section/slug"
    title: string;
};

export type DocPage = {
    section: string;
    slug: string;
    title: string;
    html?: string;
    path: string;
};

export type PageModel = {
    view: View;
    pageTitle: string;
    heading: string;

    // Only one of these is typically present depending on view:
    posts?: BlogSummary[];
    post?: BlogPost;

    docsNav?: DocNavItem[];
    doc?: DocPage;

    // Optional visible error
    error?: { message: string; status?: number; code?: string };
};

export type DirectusApi = {
    fetchBlogList(): Promise<BlogSummary[]>;
    fetchBlogPostBySlug(slug: string): Promise<BlogPost | null>;
    fetchDocsList(): Promise<{ path: string; title: string }[]>;
    fetchDocByRoute(section: string, slug: string): Promise<DocPage | null>;
};

/**
 * App routing policy:
 * - "/" => home
 * - "/about" => about
 * - "/blog" => blog list
 * - "/blog/<...slug>" => blog post (deep slug supported)
 * - "/docs" => docs index
 * - "/docs/<...path>" => docs page where last segment is slug and rest is section
 *
 * Note: docs require at least 2 segments after /docs (section + slug).
 */
export async function resolveAppRoute(slugPathRaw: string, api: DirectusApi): Promise<PageModel> {
    const slugPath = String(slugPathRaw || "");
    const segments = slugPath.split("/").filter(Boolean);
    const first = segments[0] || "";

    try {
        // HOME
        if (!first) {
            return { view: "home", heading: "Zenith", pageTitle: "Zenith | Home" };
        }

        // ABOUT
        if (first === "about" && segments.length === 1) {
            return { view: "about", heading: "About", pageTitle: "Zenith | About" };
        }

        // BLOG LIST
        if (first === "blog" && segments.length === 1) {
            const posts = await api.fetchBlogList();
            return {
                view: "blog-list",
                heading: "Blog",
                pageTitle: "Zenith | Blog",
                posts
            };
        }

        // BLOG POST (supports deep slugs: /blog/a/b/c)
        if (first === "blog" && segments.length >= 2) {
            const slug = segments.slice(1).join("/");
            const post = await api.fetchBlogPostBySlug(slug);

            if (!post) {
                return {
                    view: "not-found",
                    heading: "Not found",
                    pageTitle: "Zenith | Not Found",
                    error: { status: 404, code: "NOT_FOUND", message: `Blog post "${slug}" was not found.` }
                };
            }

            return {
                view: "blog-post",
                heading: post.title,
                pageTitle: `Zenith | Blog | ${post.title}`,
                post
            };
        }

        // DOCS
        if (first === "docs") {
            const docs = await api.fetchDocsList();
            const docsNav: DocNavItem[] = docs.map((d) => ({ path: d.path, title: d.title }));

            const docsPath = segments.slice(1).join("/");
            const parts = docsPath.split("/").filter(Boolean);

            // docs landing
            if (parts.length === 0) {
                return {
                    view: "docs-index",
                    heading: "Documentation",
                    pageTitle: "Zenith | Docs",
                    docsNav
                };
            }

            // docs page requires section + slug minimum
            if (parts.length < 2) {
                return {
                    view: "docs-index",
                    heading: "Documentation",
                    pageTitle: "Zenith | Docs",
                    docsNav,
                    error: {
                        status: 400,
                        code: "BAD_ROUTE",
                        message: "Docs routes require /docs/<section>/<slug> (or deeper)."
                    }
                };
            }

            const slug = parts[parts.length - 1];
            const section = parts.slice(0, -1).join("/");
            const doc = await api.fetchDocByRoute(section, slug);

            if (!doc) {
                return {
                    view: "not-found",
                    heading: "Not found",
                    pageTitle: "Zenith | Not Found",
                    docsNav,
                    error: {
                        status: 404,
                        code: "NOT_FOUND",
                        message: `Document "${section}/${slug}" was not found.`
                    }
                };
            }

            return {
                view: "docs-page",
                heading: doc.title,
                pageTitle: `Zenith | Docs | ${doc.title}`,
                docsNav,
                doc
            };
        }

        return {
            view: "not-found",
            heading: "Not found",
            pageTitle: "Zenith | Not Found",
            error: { status: 404, code: "NOT_FOUND", message: `No route matched "${slugPath}".` }
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            view: "not-found",
            heading: "Error",
            pageTitle: "Zenith | Error",
            error: { status: 500, code: "LOAD_FAILED", message }
        };
    }
}
