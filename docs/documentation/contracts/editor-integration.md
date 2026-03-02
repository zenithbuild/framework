---
title: "Editor Integration Contract"
description: "Language id, scope, snippets, diagnostics, and troubleshooting for Zenith editor tooling."
version: "0.1"
status: "canonical"
last_updated: "2026-02-28"
tags: ["contracts", "editor", "lsp", "snippets", "diagnostics"]
---

# Editor Integration Contract

This document defines the canonical editor integration for Zenith. It keeps zenith-language and zenith-language-server aligned with the platform contract.

## Language and Scope

- **Language id:** `zenith`
- **Scope name:** `text.html.zenith`
- **File extensions:** `.zen`, `.zen.html`, `.zenx`

There is exactly one grammar for Zenith. No legacy scopes (`zenhtml`, etc.) are registered.

## Snippets (Canonical Set)

Snippets are sourced from canonical docs. All snippets avoid patterns that trigger ZEN-DOM-* lints.

| Prefix | Description |
|--------|-------------|
| `state toggle` | State variable with toggle function |
| `signal counter` | Signal with get/set |
| `ref dom` | Ref for DOM node |
| `zenMount cleanup` | zenMount with ctx.cleanup for disposers |
| `zenEffect pattern` | Reactive effect |
| `zenOn keydown escape` | zenOn keydown with Escape handler (use inside zenMount) |
| `zenResize viewport` | zenResize with ctx.cleanup (use inside zenMount) |
| `collectRefs links` | Collect multiple refs into node list |
| `on:click` | Canonical event binding |

## Diagnostics

| Code | Meaning |
|------|---------|
| `ZEN-DOM-QUERY` | Use `ref<T>()` + zenMount or `collectRefs()` instead of querySelector/getElementById. Suppress with `// zen-allow:dom-query <reason>`. |
| `ZEN-DOM-LISTENER` | Use `zenOn(target, eventName, handler)` and register disposer via zenMount `ctx.cleanup`. |
| `ZEN-DOM-WRAPPER` | Use `zenWindow()` / `zenDocument()` instead of typeof/globalThis guards. |

## Quick Fixes (Code Actions)

- **ZEN-DOM-QUERY:** Suppress with comment, or insert ref + TODO (partial fix).
- **ZEN-DOM-LISTENER:** Replace with zenOn template and comment out old line.
- **ZEN-DOM-WRAPPER:** Replace with zenWindow() / zenDocument().

## Strict Mode

When `zenith.strictDomLints` is `true`, ZEN-DOM-* diagnostics are reported as **errors** instead of warnings.

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
