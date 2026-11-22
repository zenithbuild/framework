import { fileURLToPath } from "node:url";
import { watch } from "node:fs";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const contentScript = new URL("./build-public-content.ts", import.meta.url);
const cli = createRequire(import.meta.url).resolve("@zenithbuild/cli");
const buildArgs = ["run", fileURLToPath(contentScript)];
const options = { cwd: root, stdio: "inherit" as const };
const initial = spawnSync(process.execPath, buildArgs, options);
if (initial.status !== 0) process.exit(initial.status ?? 1);

let building = false;
let pending = false;
let stopped = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
function update() {
  if (stopped) return;
  if (building) { pending = true; return; }
  building = true;
  const child = spawn(process.execPath, buildArgs, options);
  child.once("exit", (code) => {
    building = false;
    if (code) console.error("Could not rebuild site content. See the generator output above.");
    if (pending) { pending = false; update(); }
  });
}

const watchers = ["../docs/documentation/", "src/content/blog/", "src/content/people/"].map((path) =>
  watch(new URL(path, root), { recursive: true }, (_event, filename) => {
    if (filename && !/\.(?:md|mdx|json|ya?ml)$/i.test(filename)) return;
    clearTimeout(debounce);
    debounce = setTimeout(update, 100);
  }),
);
const server = spawn("node", [cli, "dev", ...process.argv.slice(2)], options);
function stop() {
  stopped = true;
  clearTimeout(debounce);
  watchers.forEach((watcher) => watcher.close());
}
process.once("SIGINT", () => { stop(); server.kill("SIGINT"); });
process.once("SIGTERM", () => { stop(); server.kill("SIGTERM"); });
server.once("error", (error) => { stop(); console.error(error.message); process.exitCode = 1; });
server.once("exit", (code) => { stop(); process.exitCode = code ?? 0; });
