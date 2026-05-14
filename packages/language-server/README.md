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

The package bin defaults to stdio when no explicit LSP transport flag is passed,
which matches Neovim and other plain LSP client setups. Explicit transports such
as `--stdio`, `--node-ipc`, and `--socket=...` are still supported.

Supported features:
- compiler-backed diagnostics for `.zen`, `.zen.html`, and `.zenx`
- DOM-safety code actions for supported `ZEN-DOM-*` diagnostics
- limited doc-backed hover and completion for canonical Zenith primitives and `on:*` events

Limitations:
- no full TypeScript semantic completion or typechecking
- no project-wide symbol index

Editor smoke:

```bash
bun test packages/language-server/test/neovim-smoke.spec.ts
```

The Neovim smoke uses `cmd = { "zenith-language-server" }` through the local
package bin, opens `.zen` files, waits for LSP attachment, and verifies
compiler diagnostics through `vim.diagnostic`. It prints
`SKIP: nvim not installed` when Neovim is unavailable.
