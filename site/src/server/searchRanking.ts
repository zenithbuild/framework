import type { SearchRecord, SearchResult, SearchScopeConfig, SearchMatchSnippet } from "./searchTypes";

export const SCORE_EXACT_TITLE = 1000;
export const SCORE_TITLE_PREFIX = 500;
export const SCORE_TITLE_TOKEN = 250;
export const SCORE_TITLE_PARTIAL = 125;
export const SCORE_HEADING = 200;
export const SCORE_CATEGORY_SECTION_TAG = 120;
export const SCORE_CATEGORY_SECTION_TAG_PARTIAL = 40;
export const SCORE_DESCRIPTION = 80;
export const SCORE_DESCRIPTION_PARTIAL = 40;
export const SCORE_BODY = 10;
export const SCORE_BODY_PARTIAL = 5;
export const DEFAULT_RESULT_LIMIT = 50;
export const DEFAULT_EMPTY_LIMIT = 6;
export const MIN_RELEVANCE_SCORE = 20;
export const MIN_BODY_ONLY_SCORE = 25;

export function normalizeSearchText(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

function escapeRegexMeta(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightMatches(text: string, tokens: string[]): string {
  if (!text || tokens.length === 0) return text;
  const escaped = tokens.map(escapeRegexMeta).filter(Boolean);
  if (escaped.length === 0) return text;
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.replace(pattern, '<mark class="bg-primary/20 text-foreground rounded px-0.5">$1</mark>');
}

export function highlightToHtml(text: string, tokens: string[]): string {
  return highlightMatches(text, tokens);
}

function hasAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

export function extractBodySnippet(bodyText: string, tokens: string[]): string {
  const normalized = normalizeSearchText(bodyText);
  const firstToken = tokens[0] || "";
  const idx = normalized.indexOf(firstToken);
  if (idx < 0) return bodyText.slice(0, 160).trimEnd() + "…";
  const start = Math.max(0, idx - 60);
  const end = Math.min(bodyText.length, idx + 100);
  const snippet = bodyText.slice(start, end).trim();
  return (start > 0 ? "…" : "") + snippet + (end < bodyText.length ? "…" : "");
}

export function scopeMatches(recordScope: string, searchScope: SearchScopeConfig): boolean {
  if (searchScope === "global") return true;
  if (searchScope === "docs") return recordScope === "docs";
  if (searchScope === "blog") return recordScope === "blog";
  return false;
}

function findMatchedHeading(
  headings: SearchRecord["headings"],
  tokens: string[],
): { heading: { id: string; text: string }; snippet: SearchMatchSnippet } | null {
  if (!headings || headings.length === 0 || tokens.length === 0) return null;
  for (const heading of headings) {
    const normalizedHeading = normalizeSearchText(heading.text);
    if (hasAllTokens(normalizedHeading, tokens)) {
      return {
        heading,
        snippet: { field: "heading", text: heading.text, headingId: heading.id },
      };
    }
  }
  return null;
}

function stableSortOrder(a: SearchRecord, b: SearchRecord): number {
  if (a.scope !== b.scope) {
    const scopeOrder: Record<string, number> = { page: 0, docs: 1, blog: 2 };
    return (scopeOrder[a.scope] ?? 3) - (scopeOrder[b.scope] ?? 3);
  }
  return a.path.localeCompare(b.path);
}

function defaultRecordsForScope(records: SearchRecord[], scope: SearchScopeConfig): SearchRecord[] {
  const scoped = records.filter((record) => scopeMatches(record.scope, scope));
  const keyPaths = new Set<string>();
  if (scope === "global") ["/", "/docs", "/blog", "/about"].forEach((p) => keyPaths.add(p));
  if (scope === "docs") { keyPaths.add("/docs"); keyPaths.add("/docs/getting-started"); }
  const keyed = scoped.filter((record) => keyPaths.has(record.path));
  const remaining = scoped.filter((record) => !keyPaths.has(record.path));
  if (scope === "blog") {
    remaining.sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || "") || a.path.localeCompare(b.path));
  } else {
    remaining.sort(stableSortOrder);
  }
  return [...keyed, ...remaining].slice(0, DEFAULT_EMPTY_LIMIT);
}

function scoreRecord(
  record: SearchRecord,
  tokens: string[],
): { score: number; snippets: SearchMatchSnippet[]; matchedHeading?: { id: string; text: string } } {
  if (tokens.length === 0) {
    return { score: 1, snippets: [] };
  }

  const normalizedTitle = normalizeSearchText(record.title);
  const normalizedDescription = normalizeSearchText(record.description || "");
  const normalizedBody = normalizeSearchText(record.bodyText || "");
  const normalizedSection = normalizeSearchText(record.section || "");
  const normalizedCategory = normalizeSearchText(record.category || "");
  const normalizedTags = (record.tags || []).map(normalizeSearchText).join(" ");

  let score = 0;
  const snippets: SearchMatchSnippet[] = [];
  const titleTokenString = tokens.join(" ");

  if (hasAllTokens(normalizedTitle, tokens)) {
    if (normalizedTitle === titleTokenString) {
      score += SCORE_EXACT_TITLE;
    } else if (normalizedTitle.startsWith(titleTokenString)) {
      score += SCORE_TITLE_PREFIX;
    } else {
      score += SCORE_TITLE_TOKEN;
    }
    snippets.push({ field: "title", text: record.title });
  } else {
    const partialTitle = tokens.some((token) => normalizedTitle.includes(token));
    if (partialTitle) {
      score += SCORE_TITLE_PARTIAL;
      snippets.push({ field: "title", text: record.title });
    }
  }

  const headingMatch = findMatchedHeading(record.headings, tokens);
  if (headingMatch) {
    score += SCORE_HEADING;
    snippets.push(headingMatch.snippet);
  }

  const categorySectionTags = `${normalizedCategory} ${normalizedSection} ${normalizedTags}`.trim();
  if (categorySectionTags && hasAllTokens(categorySectionTags, tokens)) {
    score += SCORE_CATEGORY_SECTION_TAG;
    if (normalizedCategory && hasAllTokens(normalizedCategory, tokens)) {
      snippets.push({ field: "category", text: record.category || "" });
    }
    if (normalizedSection && hasAllTokens(normalizedSection, tokens)) {
      snippets.push({ field: "category", text: record.section || "" });
    }
  } else {
    const partialMeta = tokens.some(
      (token) =>
        normalizedCategory.includes(token) ||
        normalizedSection.includes(token) ||
        normalizedTags.includes(token),
    );
    if (partialMeta) {
      score += SCORE_CATEGORY_SECTION_TAG_PARTIAL;
    }
  }

  if (normalizedDescription && hasAllTokens(normalizedDescription, tokens)) {
    score += SCORE_DESCRIPTION;
    snippets.push({ field: "description", text: record.description || "" });
  } else if (normalizedDescription && tokens.some((token) => normalizedDescription.includes(token))) {
    score += SCORE_DESCRIPTION_PARTIAL;
    if (!snippets.some((s) => s.field === "description")) {
      snippets.push({ field: "description", text: record.description || "" });
    }
  }

  if (normalizedBody && hasAllTokens(normalizedBody, tokens)) {
    score += SCORE_BODY;
    if (snippets.length < 3) {
      snippets.push({ field: "bodyText", text: extractBodySnippet(record.bodyText || "", tokens) });
    }
  } else if (normalizedBody && tokens.some((token) => normalizedBody.includes(token))) {
    score += SCORE_BODY_PARTIAL;
    if (snippets.length < 3) {
      snippets.push({ field: "bodyText", text: extractBodySnippet(record.bodyText || "", tokens) });
    }
  }

  return {
    score,
    snippets: snippets.slice(0, 4),
    matchedHeading: headingMatch?.heading,
  };
}

function isBodyOnlyResult(result: SearchResult): boolean {
  return result.snippets.length > 0 && result.snippets.every((s) => s.field === "bodyText");
}

export function searchRecords(
  records: SearchRecord[],
  query: string,
  scope: SearchScopeConfig = "global",
): SearchResult[] {
  const tokens = tokenizeSearchQuery(query);
  const scopedRecords = records.filter((record) => scopeMatches(record.scope, scope));

  if (tokens.length === 0) {
    return defaultRecordsForScope(scopedRecords, scope).map((record) => ({ record, score: 0, snippets: [] }));
  }

  const results: SearchResult[] = [];
  const seenIds = new Set<string>();

  for (const record of scopedRecords) {
    if (seenIds.has(record.id)) continue;
    const { score, snippets, matchedHeading } = scoreRecord(record, tokens);
    if (score > 0) {
      seenIds.add(record.id);
      results.push({ record, score, snippets, matchedHeading });
    }
  }

  if (results.length === 0) return [];

  const maxScore = Math.max(...results.map((r) => r.score));
  const minScore = Math.max(MIN_RELEVANCE_SCORE, Math.floor(maxScore * 0.05));

  const filtered = results.filter((r) => {
    if (r.score < minScore) return false;
    if (isBodyOnlyResult(r) && r.score < MIN_BODY_ONLY_SCORE) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return stableSortOrder(a.record, b.record);
  });

  return filtered.slice(0, DEFAULT_RESULT_LIMIT);
}

export function applySearchFilters(
  records: SearchRecord[],
  scope: SearchScopeConfig,
  filters: {
    section?: string;
    category?: string;
    tag?: string;
    author?: string;
    sort?: string;
  },
): SearchRecord[] {
  let filtered = records.filter((record) => scopeMatches(record.scope, scope));

  if (filters.section && filters.section !== "All") {
    filtered = filtered.filter(
      (record) => normalizeSearchText(record.section || "") === normalizeSearchText(filters.section!),
    );
  }

  if (filters.category && filters.category !== "All") {
    filtered = filtered.filter(
      (record) => normalizeSearchText(record.category || "") === normalizeSearchText(filters.category!),
    );
  }

  if (filters.tag && filters.tag !== "All") {
    filtered = filtered.filter((record) =>
      (record.tags || []).some((tag) => normalizeSearchText(tag) === normalizeSearchText(filters.tag!)),
    );
  }

  if (filters.author && filters.author !== "All") {
    filtered = filtered.filter(
      (record) => normalizeSearchText(record.author || "") === normalizeSearchText(filters.author!),
    );
  }

  if (scope === "blog" && filters.sort) {
    filtered = [...filtered];
    if (filters.sort === "oldest") {
      filtered.sort((a, b) => {
        const aTime = Date.parse(a.publishedAt || "");
        const bTime = Date.parse(b.publishedAt || "");
        if (aTime !== bTime) return aTime - bTime;
        return a.path.localeCompare(b.path);
      });
    } else if (filters.sort === "featured") {
      filtered.sort((a, b) => {
        if (Boolean(b.featured) !== Boolean(a.featured)) return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
        const aTime = Date.parse(a.publishedAt || "");
        const bTime = Date.parse(b.publishedAt || "");
        return bTime - aTime;
      });
    } else {
      filtered.sort((a, b) => {
        const aTime = Date.parse(a.publishedAt || "");
        const bTime = Date.parse(b.publishedAt || "");
        return bTime - aTime;
      });
    }
  }

  return filtered;
}
