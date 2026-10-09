import { resolve } from "node:path";
import { startProcess } from "../../../apps/integration-tests/helpers/process.js";

const siteRoot = resolve(import.meta.dir, "../..");

export function startSiteCommand(command: string, args: string[] = [], env = {}) {
  const entry = process.env.ZENITH_SITE_CLI_ENTRY;
  return startProcess(entry ? "node" : "npx", [
    ...(entry ? [entry] : ["zenith"]), command, ...args,
  ], { cwd: siteRoot, env: { ...process.env, ...env } });
}

export async function startSiteDevServer(port: number, env = {}) {
  const server = startSiteCommand("dev", ["--port", String(port)], env);
  const started = Date.now();
  // The real site encodes hundreds of variants on a cold checkout.
  try {
    while (Date.now() - started < 600_000) {
      if (server.proc.exitCode !== null) throw new Error(`exited ${server.proc.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2_000) });
        await response.body?.cancel();
        if (response.status === 200) return server;
      } catch {
        // Retry while the real build completes.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("readiness timed out after 600 seconds");
  } catch (error) {
    await server.stop();
    throw new Error(`Site dev server ${port}: ${error}; ${JSON.stringify(server.logs())}`);
  }
}