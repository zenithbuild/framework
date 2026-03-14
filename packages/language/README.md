# @zenithbuild/language

Canonical Zenith VS Code language support for `.zen` files.

This package provides:
- the `zenith` language id
- the `text.html.zenith` TextMate grammar
- canonical Zenith snippets
- VS Code integration with `@zenithbuild/language-server`
- compiler-backed diagnostics plus the first `ZEN-DOM-*` quick fixes
- doc-backed hover and completion coverage for canonical Zenith APIs and documented `on:*` events

Build the packaged extension bundle:

```bash
bun run build
```

Package a downloadable VS Code-compatible artifact:

```bash
bun run package:vsix
```
