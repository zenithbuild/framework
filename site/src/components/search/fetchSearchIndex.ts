import type { SearchIndexPayload } from "../../server/searchTypes";

let pending: Promise<SearchIndexPayload> | undefined;

export function fetchSearchIndex(): Promise<SearchIndexPayload> {
  pending ??= fetch("/search-index.json", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error("Search is unavailable.");
      const index: SearchIndexPayload = await response.json();
      if (!Array.isArray(index.records)) throw new Error("Invalid search index.");
      return index;
    })
    .catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
