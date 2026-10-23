#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DOCS_ROOT = path.resolve("docs/documentation");

const hierarchy = {
  "getting-started.md": ["Getting Started", 1, 1],
  "install-compatibility.md": ["Getting Started", 1, 2],
  "getting-started/project-structure.md": ["Getting Started", 1, 3],
  "getting-started/first-page.md": ["Getting Started", 1, 4],
  "getting-started/development-workflow.md": ["Getting Started", 1, 5],
  "getting-started/build-and-preview.md": ["Getting Started", 1, 6],

  "zenith-contract.md": ["Core Concepts", 2, 1],
  "contracts/dsl-syntax.md": ["Core Concepts", 2, 2],
  "components/components-props-and-slots.md": ["Core Concepts", 2, 3],
  "reactivity/reactivity-model.md": ["Core Concepts", 2, 4],
  "reference/primitives-patterns.md": ["Core Concepts", 2, 5],
  "syntax/bindings-expressions.md": ["Core Concepts", 2, 6],
  "syntax/events.md": ["Core Concepts", 2, 7],
  "reactivity/dom-and-environment.md": ["Core Concepts", 2, 8],
  "reactivity/effects-vs-mount.md": ["Core Concepts", 2, 9],
  "reference/reactive-binding-model.md": ["Core Concepts", 2, 10],

  "routing/pages-layouts-and-dynamic-routes.md": ["Pages and Routing", 3, 1],
  "contracts/routing.md": ["Pages and Routing", 3, 2],
  "contracts/navigation.md": ["Pages and Routing", 3, 3],
  "contracts/router-contract.md": ["Pages and Routing", 3, 4],
  "contracts/navigation-lifecycle.md": ["Pages and Routing", 3, 5],
  "reference/zenlink.md": ["Pages and Routing", 3, 6],
  "routing/navigation-shell.md": ["Pages and Routing", 3, 7],

  "reference/script-server.md": ["Server and Data", 4, 1],
  "reference/server-data-api.md": ["Server and Data", 4, 2],
  "routing/route-protection.md": ["Server and Data", 4, 3],
  "components/component-server-values.md": ["Server and Data", 4, 4],
  "routing/global-middleware.md": ["Server and Data", 4, 5],
  "contracts/server-data.md": ["Server and Data", 4, 6],
  "contracts/ssr-transport.md": ["Server and Data", 4, 7],
  "contracts/hydration-contract.md": ["Server and Data", 4, 8],

  "guides/styling-and-public-assets.md": ["Styling and UI", 5, 1],
  "guides/interactive-demos.md": ["Styling and UI", 5, 2],
  "reactivity/presence.md": ["Styling and UI", 5, 3],
  "reactivity/overlay-sheet-pattern.md": ["Styling and UI", 5, 4],
  "reactivity/overlay-sheet-accessibility.md": ["Styling and UI", 5, 5],
  "reactivity/overlay-sheet-focus-dismissal.md": ["Styling and UI", 5, 6],
  "reactivity/overlay-sheet-actions.md": ["Styling and UI", 5, 7],
  "reactivity/overlay-sheet-settings.md": ["Styling and UI", 5, 8],
  "reactivity/overlay-sheet-styling-cleanup.md": ["Styling and UI", 5, 9],

  "cli-contract.md": ["Build and Tooling", 6, 1],
  "contracts/create-contract.md": ["Build and Tooling", 6, 2],
  "contracts/config-contract.md": ["Build and Tooling", 6, 3],
  "contracts/bundler-contract.md": ["Build and Tooling", 6, 4],
  "contracts/hmr-v1-contract.md": ["Build and Tooling", 6, 5],
  "contracts/editor-integration.md": ["Build and Tooling", 6, 6],
  "errors/index.md": ["Build and Tooling", 6, 7],
  "guides/common-mistakes.md": ["Build and Tooling", 6, 8],
  "guides/troubleshooting.md": ["Build and Tooling", 6, 9],
  "reference/markers.md": ["Build and Tooling", 6, 10],

  "guides/deployment-targets.md": ["Deployment", 7, 1],

  "reactivity/controlled-uncontrolled-components.md": ["Advanced", 8, 1],
  "contracts/props-contract.md": ["Advanced", 8, 2],
  "contracts/compiler-boundary.md": ["Advanced", 8, 3],
  "contracts/component-script-hoisting.md": ["Advanced", 8, 4],
  "contracts/core-contract.md": ["Advanced", 8, 5],
  "contracts/runtime-contract.md": ["Advanced", 8, 6],
  "contracts/script-boundary.md": ["Advanced", 8, 7],
  "contracts/ir-envelope.md": ["Advanced", 8, 8],
  "contracts/no-magic.md": ["Advanced", 8, 9],
  "contracts/security-drift-gates.md": ["Advanced", 8, 10],
  "contracts/extension-contract.md": ["Advanced", 8, 11],
  "contracts/extension-hooks-audit.md": ["Advanced", 8, 12],
  "guides/using-ai-with-zenith.md": ["Advanced", 8, 13],
  "guides/cms-unified-site.md": ["Advanced", 8, 14],
  "contributing/drift-gates.md": ["Advanced", 8, 15],
};

function migrateFrontmatter(raw, file, values) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) throw new Error(`${file}: missing YAML frontmatter`);

  const [section, sectionOrder, order] = values;
  const newline = match[0].includes("\r\n") ? "\r\n" : "\n";
  const retained = match[1]
    .split(/\r?\n/)
    .filter((line) => !/^(section|sectionOrder|order):\s*/.test(line));
  retained.push(`section: ${JSON.stringify(section)}`);
  retained.push(`sectionOrder: ${sectionOrder}`);
  retained.push(`order: ${order}`);

  const frontmatter = `---${newline}${retained.join(newline)}${newline}---${match[2] || newline}`;
  return frontmatter + raw.slice(match[0].length);
}

async function main() {
  const write = process.argv.includes("--write");
  let changed = 0;
  let missing = 0;

  for (const [relativePath, values] of Object.entries(hierarchy)) {
    const file = path.join(DOCS_ROOT, relativePath);
    let raw;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        missing += 1;
        console.log(`missing ${relativePath}`);
        continue;
      }
      throw error;
    }

    const migrated = migrateFrontmatter(raw, relativePath, values);
    if (migrated === raw) continue;
    changed += 1;
    console.log(`${write ? "updated" : "would update"} ${relativePath}`);
    if (write) await writeFile(file, migrated, "utf8");
  }

  console.log(`${write ? "migration" : "dry run"}: changed=${changed} missing=${missing} mapped=${Object.keys(hierarchy).length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
