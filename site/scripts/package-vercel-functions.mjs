import { copyFile, lstat, mkdir, readdir, readlink, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeFileTrace } from "@vercel/nft";

if (process.env.VERCEL) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const functions = join(root, ".vercel/output/functions");
  const directories = await readdir(functions, { recursive: true, withFileTypes: true });
  const bundles = directories.filter((entry) => entry.isDirectory() && entry.name.endsWith(".func"));
  const cache = {};

  for (const bundle of bundles) {
    const directory = join(bundle.parentPath, bundle.name);
    const files = await readdir(directory, { recursive: true, withFileTypes: true });
    const entries = files.filter((entry) => entry.isFile() && /\.[cm]?js$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name));
    if (!entries.length) continue;
    const { fileList } = await nodeFileTrace(entries, { base: root, processCwd: root, cache });
    for (const file of fileList) {
      if (!file.startsWith("node_modules/")) continue;
      const from = join(root, file);
      const to = join(directory, file);
      const stat = await lstat(from);
      await mkdir(dirname(to), { recursive: true });
      if (stat.isSymbolicLink()) {
        const link = await readlink(from);
        if (!resolve(dirname(from), link).startsWith(join(root, "node_modules") + "/")) {
          throw new Error("Function dependency points outside the site's install: " + file);
        }
        try { await symlink(link, to); } catch (error) { if (error.code !== "EEXIST") throw error; }
      } else if (stat.isFile()) {
        await copyFile(from, to);
      }
    }
  }
}
