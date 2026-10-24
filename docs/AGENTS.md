# Zenith Docs Agent Contract

The root framework agent contract at [`../AGENTS.md`](../AGENTS.md) is authoritative for Zenith syntax, runtime, router, and config behavior.

Docs-specific additions:

- Canonical docs must describe shipped behavior only. Do not document aspirational plugin, config, router, or runtime surfaces as if they already exist.
- Canon docs must use examples and snippets that compile or otherwise pass the repo's mechanical gates.
- When docs and implementation disagree, fix the contradiction or remove the stale guidance immediately. Do not leave two "authoritative" answers in place.
- Public docs must teach the same server-security model as the framework: `guard(ctx)` and `load(ctx)` are server-authoritative, client execution is advisory UX only.
- Public docs must not introduce alternate event syntax, DOM access patterns, or framework primitives beyond what the root contract allows.
