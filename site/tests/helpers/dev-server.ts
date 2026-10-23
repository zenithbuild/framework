import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { startProcess } from "../../../apps/integration-tests/helpers/process.js";

const siteRoot = resolve(import.meta.dir, "../..");

export function startSiteCommand(command: string, args: string[] = [], env = {}) {
  const entry = resolve(process.env.ZENITH_SITE_CLI_ENTRY || resolve(siteRoot, "../packages/cli/dist/index.js"));
  if (!existsSync(entry)) throw new Error(`Candidate CLI entry is missing: ${entry}`);
  if (entry === resolve(siteRoot, "../packages/cli/dist/index.js") && ["dev", "build"].includes(command)) {
    const suffix = process.platform === "win32" ? ".exe" : "";
    for (const tool of ["compiler", "bundler"]) {
      const binary = process.env[`ZENITH_${tool.toUpperCase()}_BIN`] ||
        resolve(siteRoot, `../packages/${tool}/target/release/zenith-${tool}${suffix}`);
      if (!existsSync(binary)) throw new Error(`Candidate ${tool} binary is missing: ${binary}`);
    }
  }
  return startProcess("node", [
    entry, command, ...args,
  ], { cwd: siteRoot, env: { ...process.env, ...env } });
}

// `zenith dev` silently moves to the next free port when the requested one is
// taken, so a busy port would make the readiness poll (and the test) talk to a
// different server. Fail fast instead.
function portIsListening(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolvePort(true); });
    socket.once("error", () => resolvePort(false));
  });
}

export async function startSiteDevServer(port: number, env = {}) {
  if (await portIsListening(port)) {
    throw new Error(`Site dev server ${port}: port is already in use by another process; refusing to test against it`);
  }
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
