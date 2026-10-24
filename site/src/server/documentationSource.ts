import { discoverLocalDocumentationEntries } from "./localDocumentationSource";
import {
  collectDocumentationTags,
  compareDocumentationEntries,
  groupDocumentationEntries,
  matchesDocumentationLookup,
  normalizeDocumentationLookup,
} from "./documentationSourceSupport";

type SourceMode = "local";

export interface DocumentationTag {
  slug: string;
  title: string;
  color: string | null;
  order: number | null;
}

export interface DocumentationSection {
  slug: string;
  title: string;
  description: string | null;
  order: number;
  path: string;
}

export interface DocumentationNavEntry {
  slug: string;
  routeSectionSlug: string;
  title: string;
  sidebarLabel: string;
  description: string;
  excerpt: string;
  path: string;
  sourcePath: string | null;
  section: DocumentationSection;
  tags: DocumentationTag[];
  tagSlugs: string[];
  tagTitles: string[];
  searchText: string;
  docOrder: number | null;
}

export interface DocumentationSectionGroup {
  section: DocumentationSection;
  entries: DocumentationNavEntry[];
}

export interface DocumentationDetail {
  slug: string;
  routeSectionSlug: string;
  title: string;
  sidebarLabel: string;
  description: string;
  excerpt: string;
  path: string;
  sourcePath: string | null;
  sourceKind: string;
  status: string;
  section: DocumentationSection;
  tags: DocumentationTag[];
  markdownRaw: string;
  htmlRendered: string | null;
  headings: Array<{ id: string; text: string; level: number }>;
  docOrder: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface DocumentationIndexSource {
  sourceMode: SourceMode;
  sections: DocumentationSectionGroup[];
  tags: DocumentationTag[];
}

export interface DocumentationDetailSource {
  sourceMode: SourceMode;
  document: DocumentationDetail | null;
}

export interface DocumentationDetailLookup {
  slug: string;
  sectionSlug?: string | null;
}

export function resolveDocumentationSourceMode(): SourceMode {
  const mode = (process.env.ZENITH_DOCUMENTATION_SOURCE || "local").trim().toLowerCase();

  if (mode === "local") {
    return mode;
  }

  throw new Error(
    `Unsupported ZENITH_DOCUMENTATION_SOURCE "${mode}". Use "local".`,
  );
}

export async function loadDocumentationIndexSource(): Promise<DocumentationIndexSource> {
  const sourceMode = resolveDocumentationSourceMode();
  const entries = await loadLocalDocumentationEntries();

  return {
    sourceMode,
    sections: groupDocumentationEntries(entries),
    tags: collectDocumentationTags(entries),
  };
}

export async function loadDocumentationDetailSource(slug: string): Promise<DocumentationDetailSource> {
  return loadDocumentationDetailFromLookup(slug);
}

export async function loadDocumentationDetailFromLookup(
  lookupInput: string | DocumentationDetailLookup,
): Promise<DocumentationDetailSource> {
  const sourceMode = resolveDocumentationSourceMode();
  const entries = await loadLocalDocumentationEntries();
  const lookup = normalizeDocumentationLookup(lookupInput);

  return {
    sourceMode,
    document: entries.find((entry) => matchesDocumentationLookup(entry, lookup)) || null,
  };
}

async function loadLocalDocumentationEntries(): Promise<DocumentationDetail[]> {
  return (await discoverLocalDocumentationEntries()).sort(compareDocumentationEntries);
}
