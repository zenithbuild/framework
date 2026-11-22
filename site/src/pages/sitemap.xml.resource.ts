import { stream } from "zenith:server-contract";
import { sitemapXml } from "../server/publicFeeds";

export async function load(_ctx) {
  return stream(sitemapXml(), { contentType: "application/xml; charset=utf-8" });
}
