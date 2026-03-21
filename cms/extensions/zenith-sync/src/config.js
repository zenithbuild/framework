const DEFAULTS = {
  owner: "zenithbuild",
  repo: "framework",
  ref: "master",
  docsCron: "17 * * * *",
  changelogCron: "23 * * * *",
  sharedToken: "",
};

export function loadSyncConfig(env) {
  return {
    github: {
      owner: env.REPO_SYNC_GITHUB_OWNER || DEFAULTS.owner,
      repo: env.REPO_SYNC_GITHUB_REPO || DEFAULTS.repo,
      ref: env.REPO_SYNC_GITHUB_REF || DEFAULTS.ref,
      token: env.REPO_SYNC_GITHUB_TOKEN || "",
      apiBase: (env.REPO_SYNC_GITHUB_API_BASE || "https://api.github.com").replace(/\/$/, ""),
    },
    cron: {
      documentation: env.DOCS_SYNC_CRON || DEFAULTS.docsCron,
      changelogs: env.CHANGELOG_SYNC_CRON || DEFAULTS.changelogCron,
    },
    sharedToken: env.REPO_SYNC_SHARED_TOKEN || DEFAULTS.sharedToken,
  };
}

export function toBlobUrl(config, path) {
  return `https://github.com/${config.github.owner}/${config.github.repo}/blob/${config.github.ref}/${path}`;
}

export function toRawUrl(config, path) {
  return `https://raw.githubusercontent.com/${config.github.owner}/${config.github.repo}/${config.github.ref}/${path}`;
}
