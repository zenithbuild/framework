export type SearchScope = "page" | "docs" | "blog";

export interface SearchHeading {
  id: string;
  text: string;
}

export interface SearchRecord {
  id: string;
  scope: SearchScope;
  title: string;
  description?: string;
  bodyText?: string;
  headings?: SearchHeading[];
  category?: string;
  section?: string;
  tags?: string[];
  author?: string;
  publishedAt?: string;
  readingTime?: string;
  featured?: boolean;
  path: string;
}

export type SearchScopeConfig = "global" | "docs" | "blog";

export interface SearchFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface DocsSearchFilters {
  sections: SearchFilterOption[];
  tags: SearchFilterOption[];
}

export interface BlogSearchFilters {
  categories: SearchFilterOption[];
  tags: SearchFilterOption[];
  authors: SearchFilterOption[];
  sortOrders: SearchFilterOption[];
}

export interface SearchMatchSnippet {
  field: "title" | "description" | "heading" | "bodyText" | "category" | "tags";
  text: string;
  headingId?: string;
}

export interface SearchResult {
  record: SearchRecord;
  score: number;
  matchedHeading?: SearchHeading;
  snippets: SearchMatchSnippet[];
}

export interface SearchIndexPayload {
  records: SearchRecord[];
  docsFilters: DocsSearchFilters;
  blogFilters: BlogSearchFilters;
}
