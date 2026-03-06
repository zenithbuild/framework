---
title: "Editor Integration Contract"
description: "Language id, scope, snippets, diagnostics, and troubleshooting for Zenith editor tooling."
version: "0.1"
status: "canonical"
last_updated: "2026-03-06"
tags: ["contracts", "editor", "lsp", "snippets", "diagnostics"]
---

# Editor Integration Contract

This document defines the canonical editor integration for Zenith. It keeps `@zenithbuild/language` and `@zenithbuild/language-server` aligned with the platform contract across VS Code and plain LSP clients.

## Language and Scope

- **Language id:** `zenith`
- **Scope name:** `text.html.zenith`
- **File extensions:** `.zen`, `.zen.html`, `.zenx`

There is exactly one grammar for Zenith. No legacy scopes (`zenhtml`, etc.) are registered.

## Packages

- VS Code extension package: `packages/language` (`@zenithbuild/language`)
- Language server package: `packages/language-server` (`@zenithbuild/language-server`)
- LSP binary: `zenith-language-server`

## Snippets (Canonical Set)

Snippets are sourced from canonical docs. All snippets avoid patterns that trigger ZEN-DOM-* lints.

| Prefix | Description |
|--------|-------------|
| `state-toggle` | State variable with toggle function |
| `signal-counter` | Signal with explicit `get()` / `set()` |
| `ref-dom` | Ref for DOM node |
| `zenmount-cleanup` | `zenMount` with `ctx.cleanup(...)` |
| `zeneffect-basic` | Basic reactive effect |
| `zenon-keydown-escape` | Escape key listener via `zenOn(...)` |
| `zenresize-viewport` | `zenResize(...)` viewport pattern |
| `collectrefs` | Collect multiple refs into node list |

## Diagnostics

| Code | Meaning |
|------|---------|
| `ZEN-DOM-QUERY` | Use `ref<T>()` + zenMount or `collectRefs()` instead of querySelector/getElementById. Suppress with `// zen-allow:dom-query <reason>`. |
| `ZEN-DOM-LISTENER` | Use `zenOn(target, eventName, handler)` and register disposer via zenMount `ctx.cleanup`. |
| `ZEN-DOM-WRAPPER` | Use `zenWindow()` / `zenDocument()` instead of typeof/globalThis guards. |

Diagnostics come from the canonical compiler stdin contract: the language server sends source text plus file path to `@zenithbuild/compiler`, requires `schemaVersion: 1`, and maps the returned warning envelopes into LSP diagnostics.

## Quick Fixes (Code Actions)

- **ZEN-DOM-QUERY:** Suppress with comment, or insert ref + TODO (partial fix).
- **ZEN-DOM-LISTENER:** Replace with zenOn template and comment out old line.
- **ZEN-DOM-WRAPPER:** Replace with zenWindow() / zenDocument().

## Strict Mode

When `zenith.strictDomLints` is `true`, ZEN-DOM-* diagnostics are reported as **errors** instead of warnings.

## Hover and Completion Surface

The canonical hover/completion surface is limited to Zenith primitives and syntax:

- Script and expression completions: `zenMount`, `zenEffect`, `state`, `signal`, `ref`, `zenWindow`, `zenDocument`, `zenOn`, `zenResize`, `collectRefs`
- Markup attribute completions: canonical `on:*` event attributes plus the handler-prop convention (`onClick={handler}` at component callsites)
- Hovers for `zenEffect`, `zenMount`, `state`, `signal`, `ref` must include a short definition, a tiny example, and a `Docs:` line pointing at canonical docs
- Editor tooling must not register React/Vue/Svelte snippet templates for `.zen`

Canonical hover doc targets:

- `docs/documentation/reactivity/effects-vs-mount.md`
- `docs/documentation/reactivity/reactivity-model.md`
- `docs/documentation/reactivity/dom-and-environment.md`
- `docs/documentation/syntax/events.md`

## VS Code

During monorepo development, build the extension package and launch it from VS Code's Extension Development Host:

```bash
bun run --cwd packages/language build
```

The extension owns:

- file association for `*.zen`, `*.zen.html`, and `*.zenx`
- the `zenith` language id
- the `text.html.zenith` TextMate grammar
- canonical snippets only
- automatic startup of the bundled `@zenithbuild/language-server`

Workspace settings:

- `zenith.strictDomLints`
- `zenith.enableFrameworkSnippets` (defaults to `false`; Zenith ships only canonical Zenith snippets)
- `zenith.languageServer.path`

## Neovim / Vim

Global install:

```bash
npm i -g @zenithbuild/language-server
```

Run the server directly:

```bash
zenith-language-server
```

Example Neovim `lspconfig` setup:

```lua
local lspconfig = require("lspconfig")

vim.filetype.add({
  extension = {
    zen = "zenith",
    zenx = "zenith"
  },
  pattern = {
    [".*%.zen%.html"] = "zenith"
  }
})

lspconfig.zenith = {
  default_config = {
    cmd = { "zenith-language-server" },
    filetypes = { "zenith" },
    root_dir = lspconfig.util.root_pattern("package.json", "TRAIN_VERSION", ".git")
  }
}

lspconfig.zenith.setup({})
```

## Troubleshooting

### Legacy language symptom resolution

If you previously had the legacy Zenith extension installed, uninstall it and reload VS Code.

Run **Developer: Reload Window** and verify Language Mode is **Zenith** (bottom-right status bar).

Check workspace `files.associations` for `.zen` overrides that might map to another language.

### Verify language mode

Check the bottom-right status bar in VS Code. It should show **Zenith** (or the language id) when a `.zen` file is active.

### Inspect active scope

Use **Developer: Inspect Editor Tokens and Scopes** (Command Palette). Confirm the scope includes `text.html.zenith` and that `on:click` is scoped as `entity.other.attribute-name.event.canonical.zenith` (not legacy).

### File association collisions

If `.zen` files are not recognized as Zenith:

1. **Other extensions:** Another extension may associate `.zen`. Disable conflicting extensions or change their file associations.
2. **Workspace settings:** Check `files.associations` in `.vscode/settings.json` or user settings. Ensure `.zen` maps to `zenith`.
3. **Cached extension:** Reload the window (Developer: Reload Window) or reinstall the Zenith extension to clear cached grammars.
