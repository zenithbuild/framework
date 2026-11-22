import { loadSearchIndex } from "../../server/searchIndexLoader";

export async function load(ctx) {
  return ctx.json(await loadSearchIndex());
}
