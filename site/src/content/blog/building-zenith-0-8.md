---
title: Building Zenith 0.8 around narrower, stronger contracts.
description: The 0.8 train focuses on compiler ownership, server-authoritative routing, explicit public boundaries, and maintainable framework internals.
published: true
publishedAt: 2026-07-10T12:00:00.000Z
updatedAt: 2026-07-13T12:00:00.000Z
author: site/src/content/people/judah-sullivan.json
category: Framework release
tags:
  - Compiler
  - Routing
  - Tooling
featured: true
seoTitle: Building Zenith 0.8
seoDescription: How Zenith 0.8 narrows public boundaries while strengthening compiler, routing, security, and maintenance work.
canonicalPath: /blog/building-zenith-0-8
relatedSlugs:
  - server-truth-before-client-convenience
  - tooling-that-answers-to-the-compiler
---

Zenith is a compiler-first framework, but compiler ownership is useful only when the rest of the system stays legible. The current release work adds less surface area and makes the existing boundaries more defensible.

## A smaller public surface

Internal capability does not automatically become public API. The adapter work is the clearest example: built-in deployment targets can share an internal normalized path without turning that implementation detail into a public factory contract before it is ready.

The same discipline applies to middleware, extension discovery, and tooling packages. The documentation should describe the contract that exists and label future direction as future direction.

> A framework earns trust by keeping its public promises smaller than its experiments.

```js
export default {
  target: "node",
  router: true,
  typescriptDefault: true,
};
```

## Server truth before client convenience

Protected routes run `guard` and `load` at the server boundary. The client router may mirror that result to avoid flashes during navigation, but it is never the security authority.

```zen
<script server lang="ts">
export const guard = async (ctx) => {
  const session = await ctx.auth.requireSession();
  return session ? ctx.allow() : ctx.redirect("/login");
};
</script>
```

## Tooling answers to the compiler

Diagnostics, editor support, dependency security, and maintainability all need to reflect the same language contract that projects compile against. None of those is a headline feature alone. Together they make the framework easier to inspect and safer to change.
