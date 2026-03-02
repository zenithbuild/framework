import type { BlogListEntry, BlogPostEntry, DocsNavDoc } from "./content-store.ts";

export type DocsIndexCardModel = {
    path: string;
    title: string;
    categoryTitle: string;
};

export type DocsIndexCategoryModel = {
    slug: string;
    title: string;
    docsCount: number;
    orderLabel: string;
    summary: string;
    cards: DocsIndexCardModel[];
};

export type DocsIndexDemoModel = {
    id: string;
    name: string;
    route: string;
    sourcePath: string;
    summary: string;
    tags: string[];
};

export type DocsIndexPillarModel = {
    id: string;
    title: string;
    summary: string;
    startPath: string;
    links: DocsIndexCardModel[];
};

export type DocsIndexModel = {
    view: "docs-index";
    heading: string;
    pageTitle: string;
    notice: string;
    docsNav: DocsNavDoc[];
    firstDocPath: string;
    categories: DocsIndexCategoryModel[];
    categoriesHtml: string;
    demos: DocsIndexDemoModel[];
    installPath: string;
    contractsPath: string;
    errorsPath: string;
    getStartedPath: string;
    buildPath: string;
    shipPath: string;
    aiGuidePath: string;
    aiManifestPath: string;
    reportDriftPath: string;
    pillars: DocsIndexPillarModel[];
    landingHtml: string;
};

export type DocsNavLinkModel = {
    path: string;
    slug: string;
    href: string;
    title: string;
    order: number;
    isActive: boolean;
};

export type DocsNavGroupModel = {
    id: string;
    slug: string;
    title: string;
    order: number;
    isActive: boolean;
    links: DocsNavLinkModel[];
};

type DocsDetailBaseModel = {
    heading: string;
    pageTitle: string;
    breadcrumbCategory: string;
    navGroups: DocsNavGroupModel[];
    navHtml: string;
    docHtml: string;
    articleHtml: string;
    errorMessage: string;
};

export type DocsPageModel = DocsDetailBaseModel & {
    view: "docs-page";
};

export type DocsNotFoundModel = DocsDetailBaseModel & {
    view: "not-found";
};

export type DocsErrorModel = DocsDetailBaseModel & {
    view: "error";
};

export type DocsDetailModel = DocsPageModel | DocsNotFoundModel | DocsErrorModel;

export type BlogIndexModel = {
    view: "blog-list";
    heading: string;
    pageTitle: string;
    notice: string;
    posts: BlogListEntry[];
};

type BlogDetailBaseModel = {
    heading: string;
    pageTitle: string;
    dateLabel: string;
    articleHtml: string;
    errorMessage: string;
    post: BlogPostEntry | null;
};

export type BlogPostModel = BlogDetailBaseModel & {
    view: "blog-post";
    post: BlogPostEntry;
};

export type BlogNotFoundModel = BlogDetailBaseModel & {
    view: "not-found";
};

export type BlogErrorModel = BlogDetailBaseModel & {
    view: "error";
};

export type BlogDetailModel = BlogPostModel | BlogNotFoundModel | BlogErrorModel;
