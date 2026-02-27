---
title: "Using AI with Zenith"
description: "Operational prompt contract for AI-assisted Zenith code generation."
version: "0.3"
status: "canonical"
last_updated: "2026-02-27"
tags: ["guides", "ai", "workflow", "contracts"]
---

# Using AI with Zenith

## Contract: AI Safety Guardrails

Contract: AI-generated Zenith code must follow Zenith contracts and syntax rules.

Invariant: generated code must not invent framework APIs or event syntaxes.

Definition of Done:
- AI output uses documented Zenith patterns only.
- Rule IDs are cited when a contract is enforced.

## Required Prompts for AI Sessions

When instructing an AI assistant:

- Do not invent APIs.
- Always follow Zenith bindings.
- Never use `onclick`, `onClick`, or `@click`.
- Prefer existing Zenith primitives and documented patterns.
- If unsure, search Zenith docs and cite the relevant rule ID.

## Copy-Paste System Prompt

```text
You are coding in Zenith. You MUST follow Zenith docs:
- Use on:*={handler} only (no onclick/onClick/@click)
- Use controlled/uncontrolled pattern: value/defaultValue/onValueChange
- No free identifiers in templates: all identifiers must be props/state/const in the same file
- Slots retain parent reactive scope
If unsure, consult Zenith docs before coding and cite the rule ID in comments.
```

## See Also

- [Reactivity Model](/docs/reactivity/reactivity-model)
- [Controlled vs Uncontrolled Components](/docs/reactivity/controlled-uncontrolled-components)
- [Drift Gates](/docs/contributing/drift-gates)
