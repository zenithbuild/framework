import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSiteDevServer } from "./helpers/dev-server";

const originalEntry = process.env.ZENITH_SITE_CLI_ENTRY;
let fixtures: string;

beforeAll(async () => {
  fixtures = await mkdtemp(join(tmpdir(), "zenith-site-harness-"));
  await writeFile(join(fixtures, "healthy.mjs"), [
    'import { createServer } from "node:http";',
    'const port = Number(process.argv[process.argv.indexOf("--port") + 1]);',
    'createServer((_request, response) => response.end("ready")).listen(port, "127.0.0.1");',
  ].join("\n"));
  await writeFile(join(fixtures, "failure.mjs"), 'process.exit(7);\n');
});

afterEach(() => {
  if (originalEntry === undefined) delete process.env.ZENITH_SITE_CLI_ENTRY;
  else process.env.ZENITH_SITE_CLI_ENTRY = originalEntry;
});

afterAll(async () => {
  await rm(fixtures, { recursive: true, force: true });
});

async function availablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No available port");
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  return address.port;
}

test("site harness waits for real HTTP readiness and awaits process cleanup", async () => {
  process.env.ZENITH_SITE_CLI_ENTRY = join(fixtures, "healthy.mjs");
  const port = await availablePort();
  const server = await startSiteDevServer(port);
  const url = "http://127.0.0.1:" + port + "/";
  try {
    expect(await (await fetch(url)).text()).toBe("ready");
  } finally {
    await server.stop();
  }
  expect(server.proc.exitCode !== null || server.proc.signalCode !== null).toBe(true);
  await expect(fetch(url)).rejects.toThrow();
}, 10_000);

test("site harness reports an exited command without hanging readiness", async () => {
  process.env.ZENITH_SITE_CLI_ENTRY = join(fixtures, "failure.mjs");
  await expect(startSiteDevServer(await availablePort())).rejects.toThrow("exited 7");
}, 10_000);
