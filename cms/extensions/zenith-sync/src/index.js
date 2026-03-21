import { defineEndpoint } from "@directus/extensions-sdk";
import { loadSyncConfig } from "./config.js";
import * as source from "./source.js";
import { createDocumentationOrdering, parseChangelogDates } from "./order.js";
import { syncDocumentation } from "./documentation.js";
import { syncChangelogs } from "./changelogs.js";

export default defineEndpoint({
  id: "zenith-sync",
  handler: (router, context) => {
    const config = loadSyncConfig(context.env || process.env);

    router.get("/", (_req, res) => {
      res.json({
        ok: true,
        scopes: ["documentation", "changelogs"],
        github: {
          owner: config.github.owner,
          repo: config.github.repo,
          ref: config.github.ref,
        },
        cron: config.cron,
      });
    });

    router.post("/documentation", async (req, res, next) => {
      try {
        if (!isAuthorized(req, config)) {
          res.status(403).json({ ok: false, error: "Unauthorized repo sync request." });
          return;
        }
        const result = await syncDocumentation({
          accountability: { admin: true },
          services: context.services,
          getSchema: context.getSchema,
          config,
          source,
          ordering: await createDocumentationOrdering(config, source),
        });
        res.json({ ok: result.errors.length === 0, ...result });
      } catch (error) {
        next(error);
      }
    });

    router.post("/changelogs", async (req, res, next) => {
      try {
        if (!isAuthorized(req, config)) {
          res.status(403).json({ ok: false, error: "Unauthorized repo sync request." });
          return;
        }
        const changelogDates = parseChangelogDates(await source.loadRootChangelog(config));
        const result = await syncChangelogs({
          accountability: { admin: true },
          services: context.services,
          getSchema: context.getSchema,
          config,
          source,
          changelogDates,
        });
        res.json({ ok: result.errors.length === 0, ...result });
      } catch (error) {
        next(error);
      }
    });
  },
});

function isAuthorized(req, config) {
  const headerToken = req.get("x-repo-sync-token");
  const hasSharedToken = Boolean(config.sharedToken);
  const hasValidSharedToken = hasSharedToken && headerToken === config.sharedToken;
  const isAdmin = Boolean(req.accountability?.admin);
  return isAdmin || hasValidSharedToken;
}
