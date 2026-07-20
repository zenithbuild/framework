import type { BlogPost } from "./postSource";
import { buildBlogRecords, buildBlogFilters } from "./siteSearchIndex";
import type { SearchRecord, BlogSearchFilters } from "./searchTypes";

export interface BlogSearchViewModel {
  records: SearchRecord[];
  filters: BlogSearchFilters;
}

export function createBlogSearchViewModel(posts: BlogPost[]): BlogSearchViewModel {
  const records = buildBlogRecords(posts);
  return {
    records,
    filters: buildBlogFilters(records),
  };
}
