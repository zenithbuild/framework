---
title: Tooling that answers to the compiler
description: Diagnostics and editor support are useful only when they reflect the same Zenith language contract that projects compile against.
published: true
publishedAt: 2026-07-06T12:00:00.000Z
author: site/src/content/people/jonathan-streetman.json
category: Tooling
tags:
  - Tooling
  - Compiler
  - Diagnostics
featured: false
canonicalPath: /blog/tooling-that-answers-to-the-compiler
relatedSlugs:
  - building-zenith-0-8
  - direct-web-development-again
---

Editor tooling is trustworthy only when it reports the language the compiler actually accepts.

## Structured diagnostics

Warnings and errors should cross the compiler boundary with their severity, source, and location intact. Editor integrations should not reinterpret string output into a second diagnostic system.

## One release line

The language package, language server, and packaged editor extension need to verify against the same compiler train. That keeps downloadable tooling from drifting away from the framework it claims to describe.

## Boring correctness

Hover text, completion, and quick fixes are valuable when they are predictable. Compiler-backed answers matter more than a long list of speculative editor features.
