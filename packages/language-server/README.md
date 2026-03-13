# @zenithbuild/language-server

Canonical LSP server for Zenith.

This server ships:
- compiler-backed diagnostics sourced from `@zenithbuild/compiler`
- `ZEN-DOM-QUERY`, `ZEN-DOM-LISTENER`, and `ZEN-DOM-WRAPPER` quick fixes
- doc-backed hover and completion coverage for canonical Zenith primitives and documented `on:*` events

Global install:

```bash
npm i -g @zenithbuild/language-server
```

Run over stdio:

```bash
zenith-language-server
```
