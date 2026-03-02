---
title: "Drift Gates"
description: "Contribution checks for contract integrity, docs metadata, and deterministic AI indices."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["contributing", "ci", "drift-gates"]
---

# Drift Gates

## Contract: Required Checks

Contract: Contract-sensitive changes require docs integrity checks and AI endpoint drift checks.

Invariant: Canonical docs include required frontmatter and stable section headings.

Definition of Done:
- AI endpoint generation check passes.
- Docs integrity check passes.

Failure Modes:
- Missing frontmatter in canonical docs.
- Canonical docs missing from manifest or index.
- llms start links point to missing content.

Evidence:
- CI runs `generate-ai-endpoints --check` and docs drift checker.

## Contract: Forbidden Patterns

Banned:
- Legacy event syntaxes in canonical docs.
- Deprecated template block syntaxes in canonical docs.
- Contract text endorsing default client-side URL mutation.
- Controlled/uncontrolled examples that violate naming conventions.
- Free identifiers in canonical Zenith code fences.
- Vanilla listener patterns in Zenith snippets without explicit behavior-wiring context.

Definition of Done:
- Canonical docs remain aligned with routing, SSR, and syntax contracts.

Failure Modes:
- Canonical docs reintroduce outdated syntax or behavior.
- Contract pages drift from framework enforcement.

Evidence:
- Drift checker reports zero forbidden-pattern matches in content sources.
- Snippet gate reports zero controlled/uncontrolled naming violations.
- Snippet gate reports zero free-identifier usage in Zenith fences.
