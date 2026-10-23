---
title: Server truth before client convenience
description: Why guard and load stay server-authoritative while client routing remains an optimization layer.
published: true
publishedAt: 2026-07-08T12:00:00.000Z
author: site/src/content/people/judah-sullivan.json
category: Routing
tags:
  - Routing
  - Server
  - Security
featured: false
canonicalPath: /blog/server-truth-before-client-convenience
relatedSlugs:
  - building-zenith-0-8
  - tooling-that-answers-to-the-compiler
---

Zenith treats the server response as the route contract. Soft navigation can make that contract feel immediate, but it cannot replace it.

## One authority

The server evaluates route matching, `guard`, and `load` before protected HTML is returned. A direct request and a client transition must reach the same outcome.

## Fetch before commit

The client router fetches fresh server-authored content before it commits the next view. Redirects, denies, and failures keep their server meaning. If the client cannot preserve that meaning, it falls back to a normal browser navigation.

## Animation follows lifecycle

Route transitions are choreography around a successful navigation. They do not get to redefine when data is valid or when a protected route is allowed.
