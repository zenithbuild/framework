---
title: "Install and Compatibility"
description: "Supported install flow and compatibility guarantees for Zenith beta trains."
version: "0.3"
status: "canonical"
last_updated: "2026-02-25"
tags: ["install", "compatibility", "release"]
---

# Install and Compatibility

## ZEN-RULE-114: Clean-Room Scaffold + Build Is the Compatibility Proof

Contract: a beta train is supported when clean-room scaffold, install, and `zenith build` succeed with deterministic outputs.

## Recommended Install

```bash
npx create-zenith@beta my-app
cd my-app
npm install
npx zenith build
```

## Version Policy

- `@zenithbuild/core` may bump independently for CLI-wrapper fixes.
- Engine packages (compiler, cli, runtime, router, bundler) move together for engine changes.

If internal versions skew, reinstall from a clean dependency state.
