---
name: roast
description: Constructive critique via five Hacker News style personas with claim validation. Use for Zenith patch reviews, Graphify reports, package audits, issue packets, release readiness checks, and requests to roast, poke holes, stress test, gate, critique, validate, or decide whether a change is safe.
---

# Roast: Evidence-Based Devil's Advocate Review

This repo-local skill adapts the community Roast skill pattern for Zenith. The source pattern is constructive critique through five skeptical personas, followed by strict evidence validation before any claim reaches the final report.

Source reference: https://claudskills.com/skills/roast/

## Zenith compatibility

Use one reviewer agent by default. Do not spawn extra agents, swarm, or parallel extraction unless the user explicitly approves that escalation for a specific review.

For Zenith issue closeout, run the five Roast personas as internal review lenses inside the reviewer pass:

- Skeptical Senior: long-term maintenance, sustainability, hidden cost
- Well-Actually Pedant: precision, terminology, claim truthfulness
- Enthusiastic Newcomer: onboarding clarity, docs usability, first-read confusion
- Contrarian Provocateur: assumptions, alternatives, unnecessary process
- Pragmatic Builder: production readiness, operational risk, merge practicality

If the user explicitly asks for the full upstream multi-agent Roast and approves extra agents, each persona may run as a read-only reviewer. Otherwise, keep the default two-agent workflow: one worker, one Roast reviewer.

## Purpose

Use Roast mode as a strict review protocol for:

- Final patches
- Graphify reports
- Package audits
- Issue packets
- Release readiness checks

This skill is instruction-only. It does not run scripts by itself and does not modify files during review.

## When to use

Use Roast mode when:

- Reviewing a patch before merge
- Reviewing Graphify output before trusting it
- Auditing one Zenith package boundary
- Validating an agent-generated issue packet
- Deciding if an issue is merge-safe
- Stress testing an approach or process proposal

Do not use Roast mode to free-roam the repo, invent new work, or convert a narrow review into implementation planning.

## Required inputs

Before reviewing, collect the minimum relevant context:

- Issue number and issue body
- Intended scope
- Allowed files
- Forbidden files or packages
- Current diff
- Test output or audit output
- Graphify query or report evidence when available

If Graphify exists and `graphify-out/graph.json` is available, query Graphify before opening broad raw files. If no graph exists, say that and use targeted file inspection only.

## Read-only discipline

Roast review is read-only.

Allowed operations:

- Read files
- Search with `rg`, `find`, or equivalent
- Inspect diffs with `git diff`, `git status`, and `git log`
- Run narrow read-only checks when needed to validate claims

Forbidden operations during Roast review:

- Editing files
- Staging, committing, pushing, or merging
- Deleting, moving, or regenerating artifacts
- Broad refactors
- Expanding issue scope

If a real blocker is found, report it. Do not fix it unless the user explicitly switches from review to implementation.

## Claim validation

Every serious Roast claim must be validated before it appears in the final report.

Use these verdicts:

- `VALID`: evidence directly supports the claim
- `PARTIAL`: the claim has merit but is overstated or incomplete
- `UNFOUNDED`: evidence contradicts it or no support exists
- `SUBJECTIVE`: preference or judgment call, not a factual blocker

For each serious claim, cite one or more of:

- File path and line
- Diff hunk
- Command output
- Test result
- Graphify query or report result

Never accept a claim because it sounds plausible or because multiple lenses agree. Verify it against the repo.

## Review lenses

### 1. Scope Guardian

Ask:

- Did the change stay inside the issue?
- Were unrelated files touched?
- Did the agent sneak in cleanup work?
- Did the patch change behavior the issue did not ask for?

### 2. Architecture Skeptic

Ask:

- Does this respect Zenith package boundaries?
- Did it blur runtime, compiler, router, or bundler responsibilities?
- Did it create hidden coupling?
- Does it make future maintenance harder?

### 3. Test Prosecutor

Ask:

- What proves the fix?
- Was the narrowest useful test run?
- Are snapshots, fixtures, and generated outputs handled correctly?
- Is test evidence real or assumed?

### 4. Maintenance Realist

Ask:

- Is the patch smaller than the problem?
- Is it readable six months later?
- Did it add config or process weight without enough value?
- Is there a simpler safer path?

### 5. Release Gatekeeper

Ask:

- Is this safe to merge?
- Could this affect published package APIs?
- Could this affect release artifacts?
- Is there hidden runtime, compiler, router, or bundler behavior change?
- What would block release?

## Package-specific checks

### compiler

- Transformation safety
- Generated output boundaries
- Rust and TypeScript boundary assumptions
- Fixture and snapshot impact
- Accidental runtime behavior changes

### runtime

- Hydration behavior
- DOM binding behavior
- Lifecycle and cleanup behavior
- Payload validation
- SSR and client parity

### router

- Route matching behavior
- basePath behavior
- Route result validation
- Golden fixture usage
- Client and server parity

### bundler

- Active source versus archived legacy snapshots
- Rolldown integration assumptions
- Emitted asset behavior
- Public asset handling
- Generated output boundaries

### cli

- Command behavior
- Dev, build, and test workflow impact
- Script integration
- User-facing output changes

### language

- Generated output handling
- Source versus out directory boundaries
- No hand edits to generated files

### docs/maintainability

- Docs truthfulness
- No claims beyond implemented behavior
- File-size policy consistency
- Allowlist and exclusion clarity

## Graphify-specific checks

When roasting Graphify output, ask:

- Did Graphify correctly identify package boundaries?
- Did it confuse source with generated output?
- Did it confuse archived legacy snapshots with active source?
- Did it over-rank fixtures or golden files?
- Did it produce useful targeted answers?
- Did it reduce raw file scanning?
- Did it create more overhead than value?
- Should graph output stay local only?
- Should any generated config be committed?
- Does the workflow help Kimi or Codex stay in scope?

## Output format

Return:

### Verdict

Use one:

- `merge-safe`
- `needs changes`
- `reject`

For process/tool adoption reviews, use one:

- `adopt`
- `keep experimental`
- `reject`

### Blockers

Only issues that must be fixed before merge or adoption.

### Warnings

Risks that do not block merge but should be known.

### Nice-to-haves

Optional improvements. Keep short.

### Claim Validation

List serious claims with verdicts and evidence.

### Evidence

Include concrete file paths, diff hunks, command outputs, test results, or Graphify results.

### Final recommendation

Say exactly what should happen next.
