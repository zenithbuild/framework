import { stream } from "zenith:server-contract";
import { blogRss } from "../../server/publicFeeds";

export async function load(_ctx) {
  return stream(blogRss(), { contentType: "application/rss+xml; charset=utf-8" });
}
