---
title: Direct web development again
description: The design principles behind Zenith’s compiler-first approach and its preference for explicit browser output.
published: true
publishedAt: 2026-07-04T12:00:00.000Z
author: site/src/content/people/judah-sullivan.json
category: Framework
tags:
  - Compiler
  - Runtime
  - Design
featured: false
canonicalPath: /blog/direct-web-development-again
relatedSlugs:
  - building-zenith-0-8
  - tooling-that-answers-to-the-compiler
---

Zenith began with a simple question: can modern web development stay capable while making it easier to understand what the browser actually receives?

## Compile structure early

The compiler resolves structural work before the browser boots. Runtime behavior remains narrow and explicit, which makes authored code easier to connect to emitted HTML and JavaScript.

## Keep ownership visible

State, signals, refs, slots, and route data each have defined ownership. Those boundaries matter most when components get deeper and interactive work becomes harder to trace.

## Let tooling share the contract

The CLI, language server, docs, and runtime should not maintain separate interpretations of Zenith. They should all answer to the same compiler-owned rules.
