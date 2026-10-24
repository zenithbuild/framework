import type { DocumentationDetail, DocumentationSectionGroup } from "./documentationSource";

export interface DocumentationReaderEntry {
  path: string;
  title: string;
  sidebarLabel: string;
  excerpt: string;
  current: boolean;
}

export interface DocumentationReaderSection {
  slug: string;
  title: string;
  description: string;
  current: boolean;
  entries: DocumentationReaderEntry[];
}

export interface DocumentationReaderHeading {
  id: string;
  text: string;
  level: number;
}

export interface DocumentationReaderBreadcrumb {
  label: string;
  path: string;
  current: boolean;
}

export interface DocumentationReaderLink {
  path: string;
  title: string;
  excerpt: string;
}

export interface DocumentationViewModel {
  title: string;
  description: string;
  path: string;
  sectionTitle: string;
  sectionDescription: string;
  sectionSlug: string;
  htmlRendered: string;
  breadcrumbs: DocumentationReaderBreadcrumb[];
  sections: DocumentationReaderSection[];
  headings: DocumentationReaderHeading[];
  tags: string[];
  previous: DocumentationReaderLink | null;
  next: DocumentationReaderLink | null;
}

export function createDocumentationViewModel(
  document: DocumentationDetail,
  sections: DocumentationSectionGroup[],
  _sourceMode: string,
): DocumentationViewModel {
  const currentGroup = sections.find((group) => group.section.slug === document.section.slug) || null;
  const readingOrder = sections.flatMap((group) => group.entries);
  const currentIndex = readingOrder.findIndex((entry) => entry.path === document.path);
  const previous = currentIndex > 0 ? readingOrder[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < readingOrder.length - 1 ? readingOrder[currentIndex + 1] : null;

  return {
    title: document.title,
    description: document.description,
    path: document.path,
    sectionTitle: document.section.title,
    sectionDescription: currentGroup?.section.description || document.section.description || "",
    sectionSlug: document.section.slug,
    htmlRendered: document.htmlRendered || "",
    breadcrumbs: [
      { label: "Docs", path: "/docs", current: false },
      { label: document.section.title, path: document.section.path, current: false },
      { label: document.title, path: document.path, current: true },
    ],
    sections: sections.map((group) => ({
      slug: group.section.slug,
      title: group.section.title,
      description: group.section.description || "",
      current: group.section.slug === document.section.slug,
      entries: group.entries.map((entry) => ({
        path: entry.path,
        title: entry.title,
        sidebarLabel: entry.sidebarLabel,
        excerpt: entry.excerpt,
        current: entry.path === document.path,
      })),
    })),
    headings: document.headings.map((heading) => ({
      id: heading.id,
      text: heading.text,
      level: heading.level,
    })),
    tags: document.tags.map((tag) => tag.title),
    previous: previous ? { path: previous.path, title: previous.title, excerpt: previous.excerpt } : null,
    next: next ? { path: next.path, title: next.title, excerpt: next.excerpt } : null,
  };
}
