import { existsSync } from "node:fs";
import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// Public asset sync and dev-state polling helpers extracted from zenith-workspace.mjs.
// Factory closes over publicRoot/distRoot and a private publicAssetSyncChain so the
// surrounding workspace script does not own sync chain state.

export function createPublicAssetSync({ publicRoot, distRoot }) {
  let publicAssetSyncChain = Promise.resolve();

  async function syncPublicAssets() {
    if (!existsSync(publicRoot)) return;

    await mkdir(distRoot, { recursive: true });
    const entries = await readdir(publicRoot, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const source = resolve(publicRoot, entry.name);
      const target = resolve(distRoot, entry.name);
      await copyPublicEntryWithRetry(source, target);
    }
  }

  function isTransientPublicAssetError(error) {
    const code = typeof error?.code === "string" ? error.code : "";
    return code === "ENOENT" || code === "EEXIST" || code === "EBUSY";
  }

  function delay(ms) {
    return new Promise((resolveDelay) => {
      setTimeout(resolveDelay, ms);
    });
  }

  async function copyPublicEntryWithRetry(source, target, attempt = 0) {
    try {
      await cp(source, target, { force: true, recursive: true });
    } catch (error) {
      if (!isTransientPublicAssetError(error) || attempt >= 3) {
        throw error;
      }
      await mkdir(distRoot, { recursive: true });
      await delay(50 * (attempt + 1));
      await copyPublicEntryWithRetry(source, target, attempt + 1);
    }
  }

  function schedulePublicAssetSync() {
    publicAssetSyncChain = publicAssetSyncChain
      .catch(() => {})
      .then(() => syncPublicAssets());
    return publicAssetSyncChain;
  }

  async function readDevState(origin) {
    if (!origin) return null;
    try {
      const response = await fetch(new URL("/__zenith_dev/state", origin), {
        signal: AbortSignal.timeout(500),
      });
      if (!response.ok) return null;
      const payload = await response.json();
      return payload && typeof payload === "object" ? payload : null;
    } catch {
      return null;
    }
  }

  function startDevPublicAssetSync(origin) {
    if (!origin) {
      return () => {};
    }

    let stopped = false;
    let inFlight = false;
    let pollTimer = null;
    let lastSyncedBuildId = Number.NaN;

    async function poll() {
      if (stopped || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const state = await readDevState(origin);
        const buildId = Number(state?.buildId);
        if (state?.status === "ok" && Number.isInteger(buildId) && buildId !== lastSyncedBuildId) {
          await schedulePublicAssetSync();
          lastSyncedBuildId = buildId;
        }
      } catch {
        // Retry on the next poll tick.
      } finally {
        inFlight = false;
        if (!stopped) {
          pollTimer = setTimeout(() => {
            void poll();
          }, 250);
        }
      }
    }

    void poll();

    return () => {
      stopped = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
  }

  return {
    schedulePublicAssetSync,
    startDevPublicAssetSync,
  };
}
