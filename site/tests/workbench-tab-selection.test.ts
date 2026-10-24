import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// JUD-48: Button snapshots its props (ZEN-RULE-104), so CodeWorkbench must keep
// aria-selected/tabIndex in sync through the forwarded tab refs.
const source = readFileSync(resolve(import.meta.dir, "../src/components/home/CodeWorkbench.zen"), "utf8");
const exampleKeys = ["route", "state", "server", "events"];
const viewKeys = ["code", "compiler", "runtime", "bundler", "cli"];
const refNames = ["routeRef", "stateRef", "serverRef", "eventsRef", "codeRef", "compilerRef", "runtimeRef", "bundlerRef", "cliRef"];

function loadSyncTabSelection() {
  const match = source.match(/function syncTabSelection\(\) \{\n[\s\S]*?\n\}\n/);
  if (!match) throw new Error("syncTabSelection() not found in CodeWorkbench.zen");
  const body = match[0].replace(/ as HTMLButtonElement \| null/g, "").replace(/: Array<\[string, any\]>/g, "");
  return new Function(...refNames, "activeExample", "activeView", `${body}\nsyncTabSelection();`);
}

function fakeTab() {
  const attributes: Record<string, string> = { "aria-selected": "stale" };
  return { tabIndex: 99, attributes, setAttribute(name: string, value: string) { attributes[name] = value; } };
}

describe("CodeWorkbench tab selection semantics", () => {
  test("marks exactly the active example and view tabs as selected and focusable", () => {
    const syncTabSelection = loadSyncTabSelection();
    for (const [example, view] of [["state", "compiler"], ["events", "cli"], ["route", "code"]]) {
      const tabs = refNames.map(() => fakeTab());
      syncTabSelection(...tabs.map((tab) => ({ current: tab })), example, view);
      const keys = [...exampleKeys, ...viewKeys];
      tabs.forEach((tab, index) => {
        const active = keys[index] === (index < exampleKeys.length ? example : view);
        expect(tab.attributes["aria-selected"]).toBe(active ? "true" : "false");
        expect(tab.tabIndex).toBe(active ? 0 : -1);
      });
    }
  });

  test("skips unmounted tab refs", () => {
    const syncTabSelection = loadSyncTabSelection();
    expect(() => syncTabSelection(...refNames.map(() => ({ current: null })), "state", "code")).not.toThrow();
  });

  test("syncs on mount and on every selection after updating the active state", () => {
    expect(source).toContain("activeExample = example; activeView = view; syncTabSelection();");
    expect(source).toMatch(/zenMount\(\(ctx\) => \{ syncTabSelection\(\);/);
  });
});
