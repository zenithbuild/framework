export interface PublicRouteMetadata {
  path: string;
  title: string;
  description: string;
  label: string;
  kind: "website" | "blog" | "blog-posting" | "collection" | "tech-article" | "about";
  published?: string;
  updated?: string;
  author?: string;
  breadcrumbs?: Array<{ name: string; path: string }>;
}

export interface PageMetadata extends PublicRouteMetadata {
  documentTitle: string;
  canonicalUrl: string;
  socialImageUrl: string;
  ogType: "website" | "article";
  robots: string;
  structuredData: string;
}

export const PUBLIC_ROUTE_METADATA: Record<string, PublicRouteMetadata> = {
  "/": {
    path: "/",
    title: "Compiler-first UI framework",
    description: "Zenith is a compiler-first UI framework with explicit reactive primitives, server-owned routing boundaries, and native tooling.",
    label: "Home",
    kind: "website",
  },
  "/blog": {
    path: "/blog",
    title: "Zenith framework journal",
    description: "Read factual notes about the Zenith compiler, runtime, router, native tooling, security work, and framework design decisions.",
    label: "Blog",
    kind: "blog",
  },
  "/blog/building-zenith-0-8": {
    path: "/blog/building-zenith-0-8",
    title: "Building Zenith 0.8",
    description: "How Zenith 0.8 narrows public boundaries while strengthening compiler, routing, security, and framework maintenance work.",
    label: "Building Zenith 0.8",
    kind: "blog-posting",
    published: "2026-07",
  },
  "/docs": {
    path: "/docs",
    title: "Zenith documentation",
    description: "Start with Zenith and follow the canonical component, reactivity, routing, server, DOM, Tailwind, adapter, and deployment contracts.",
    label: "Documentation",
    kind: "collection",
  },
  "/docs/getting-started": {
    path: "/docs/getting-started",
    title: "Getting started with Zenith",
    description: "Create a Zenith project, understand its route structure, and build a component with canonical state, event, ref, and routing syntax.",
    label: "Getting Started",
    kind: "tech-article",
  },
  "/about": {
    path: "/about",
    title: "About Zenith",
    description: "Learn why Zenith is compiler-first, how its explicit framework boundaries are designed, and how the independent project is being built.",
    label: "About",
    kind: "about",
  },
};

export function normalizeSiteOrigin(value: string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^https:\/\/[^/]+/i.test(raw)) return "";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export function configuredSiteOrigin() {
  return normalizeSiteOrigin(
    process.env.ZENITH_SITE_ORIGIN || process.env.ZENITH_PUBLIC_ORIGIN || metadataSettings.siteUrl || "",
  );
}

function structuredDataFor(route: PublicRouteMetadata, origin: string, canonicalUrl: string, imageUrl: string) {
  if (!origin || !canonicalUrl) return "";
  const website = { "@type": "WebSite", name: "ZenithBuild", url: origin };
  let value: Record<string, unknown>;

  if (route.kind === "blog-posting") {
    value = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: route.title,
      description: route.description,
      author: { "@type": "Person", name: route.author || "Zenith Team" },
      datePublished: route.published,
      dateModified: route.updated,
      mainEntityOfPage: canonicalUrl,
      image: imageUrl,
      isPartOf: website,
    };
  } else if (route.kind === "tech-article") {
    const breadcrumbs = route.breadcrumbs || [
      { name: "Documentation", path: "/docs" },
      { name: route.label, path: route.path },
    ];
    value = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          headline: route.title,
          description: route.description,
          mainEntityOfPage: canonicalUrl,
          isPartOf: website,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: new URL(item.path, `${origin}/`).href,
          })),
        },
      ],
    };
  } else {
    const type = route.kind === "blog" ? "Blog" : route.kind === "collection" ? "CollectionPage" : route.kind === "about" ? "AboutPage" : "WebSite";
    value = {
      "@context": "https://schema.org",
      "@type": type,
      name: route.title,
      description: route.description,
      url: canonicalUrl,
      isPartOf: route.kind === "website" ? undefined : website,
    };
  }

  return JSON.stringify(value);
}

export function createPageMetadata(path: string, originValue = configuredSiteOrigin()): PageMetadata {
  const route = PUBLIC_ROUTE_METADATA[path];
  if (!route) throw new Error(`Missing public route metadata for ${path}`);
  return createContentMetadata(route, originValue);
}

export function createContentMetadata(route: PublicRouteMetadata, originValue = configuredSiteOrigin()): PageMetadata {
  const origin = normalizeSiteOrigin(originValue);
  const canonicalUrl = origin ? new URL(route.path, `${origin}/`).href : "";
  const configuredImage = typeof metadataSettings.socialImage?.src === "string" && /^\/(?!\/)/.test(metadataSettings.socialImage.src)
    ? metadataSettings.socialImage.src
    : "/logo.png";
  const socialImageUrl = origin ? new URL(configuredImage, `${origin}/`).href : "";
  const siteTitle = typeof metadataSettings.defaultSeoTitle === "string" && metadataSettings.defaultSeoTitle.trim()
    ? metadataSettings.defaultSeoTitle.trim()
    : "ZenithBuild";
  return {
    ...route,
    documentTitle: `${siteTitle} | ${route.title}`,
    canonicalUrl,
    socialImageUrl,
    ogType: route.kind === "blog-posting" || route.kind === "tech-article" ? "article" : "website",
    robots: "index,follow",
    structuredData: structuredDataFor(route, origin, canonicalUrl, socialImageUrl),
  };
}
import { readFileSync } from "node:fs";

interface MetadataSettings {
  defaultSeoTitle?: string;
  siteUrl?: string;
  socialImage?: { src?: string };
}

function readMetadataSettings(): MetadataSettings {
  try {
    return JSON.parse(readFileSync(new URL("./settings.json", import.meta.url), "utf8")) as MetadataSettings;
  } catch {
    return {};
  }
}

const metadataSettings = readMetadataSettings();
