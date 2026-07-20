import type { DocumentationDetail } from "./documentationSource";
import { buildDocsRecords, buildDocsFilters } from "./siteSearchIndex";
import type { SearchRecord, DocsSearchFilters } from "./searchTypes";

export interface DocsSearchViewModel {
  records: SearchRecord[];
  filters: DocsSearchFilters;
}

export function createDocsSearchViewModel(docs: DocumentationDetail[]): DocsSearchViewModel {
  const records = buildDocsRecords(docs);
  const allRecords = [...buildDocsRecords(docs)];
  return {
    records,
    filters: buildDocsFilters(allRecords),
  };
}
