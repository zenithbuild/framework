# Zenith Roast GitHub Issue Drafts

Source reports:

- `docs/_internal/audits/zenith-repo-roast-audit.md`
- `docs/_internal/audits/zenith-roast-followup-plan.md`

Status: draft only. Do not create these issues until reviewed.
Total drafts: 15

## Recommended Creation Order

### Create immediately

These are needed before the next public push:

1. Add a real Getting Started quickstart
2. Enforce non-empty Getting Started docs category
3. Decide hosted adapter parity scope for route-check and downloads
4. Confirm actual Vercel/Netlify runtime behavior
5. Pin package manager and CI toolchain versions
6. Publish a native-platform support matrix
7. Define plugin trust model before expanding APIs

### Create but defer

These are valid work, but should not start until the immediate issues are settled:

8. Design first-party icon feature M1
9. Add tests/docs for unsafe HTML behavior
10. Add Tailwind token/style enforcement
11. Continue file-size reduction slices for near-limit files
12. Improve compiler/parser maintainability without broad rewrite
13. Clean up docs source-of-truth drift
14. Clarify editor/language tooling roadmap
15. Clean up Graphify schema expectations around empty edge data

### Do not create yet

Do not create separate issues for these until they become narrower:

- General-purpose plugin API expansion
- Runtime-heavy icon system
- Broad parser rewrite
- Broad architecture cleanup
- Styling redesign
- Marketing polish before first-run docs
- CMS integration
- Generic auth abstraction
- Full-repo Graphify architecture work

## Issue Drafts

### 1. Add a real Getting Started quickstart

- Title: Add a real Getting Started quickstart and verify the first-run path
- Priority: High
- Severity: High
- Labels: `priority:high`, `area:docs`, `area:dx`, `type:docs`, `good-first-docs`
- Suggested milestone: `M0: Adoption + First Run`
- Problem: The Getting Started category is effectively empty, so new users hit advanced contracts before they get a working app.
- Evidence: The audit found `docs/documentation/getting-started/` contains only `_category.yml`; the follow-up plan ranks this as the top adoption problem.
- Scope: Add a concise quickstart covering install/create/run, one reactive component, one route, and one server `load(ctx)`.
- Out of scope: Marketing page, new APIs, hosted parity promises, plugins, icons, CMS, generic auth.
- Acceptance criteria: A fresh user can follow the page to a running app; snippets use canonical Zenith syntax; docs avoid unsupported features; docs gates pass.
- Validation/checks: `npm run docs:structure`, `npm run docs:syntax`, and `npm run docs:snippets` if the local compiler tooling is already available.
- Notes for implementation: Keep the page short and factual. Link to deeper contracts rather than copying them into the quickstart.

### 2. Enforce non-empty Getting Started docs category

- Title: Enforce non-empty Getting Started docs category
- Priority: High
- Severity: Medium
- Labels: `priority:high`, `area:docs`, `area:dx`, `area:tests`, `type:test`, `type:maintenance`
- Suggested milestone: `M0: Adoption + First Run`
- Problem: The docs gate allows a category to exist with only `_category.yml`, which let the primary onboarding category ship empty.
- Evidence: Audit evidence showed `find docs/documentation/getting-started -maxdepth 2 -type f` returned only `_category.yml`; existing docs structure checks validate metadata but not category coverage.
- Scope: Add a narrow docs gate that fails if `getting-started/` has no public markdown page.
- Out of scope: Full nav validation, broad docs IA rewrite, generated AI output changes unless required by the docs gate.
- Acceptance criteria: The gate fails when Getting Started has only `_category.yml`; it passes with the new quickstart; error text names the missing category content clearly.
- Validation/checks: `npm run docs:structure`, `npm run docs:syntax`, `git diff --check`, file-size audit.
- Notes for implementation: Prefer a docs-local gate update. Do not make this a generic CMS or site routing feature.

### 3. Decide hosted adapter parity scope for route-check and downloads

- Title: Decide hosted adapter parity scope for route-check and downloads
- Priority: High
- Severity: High
- Labels: `priority:high`, `area:adapters`, `area:router`, `area:docs`, `type:decision`, `needs:decision`
- Suggested milestone: `M2: Hosted Adapter Trust`
- Problem: Hosted Vercel/Netlify behavior is documented as incomplete for advisory route-check and downloads, but the product stance is not decided.
- Evidence: The audit cites route-protection docs saying hosted adapter auth parity remains deferred and hosted adapters skip route-check; deployment docs say hosted `ctx.download()` returns 501.
- Scope: Decide whether the milestone closes parity now or ships a tested capability matrix with explicit limitations.
- Out of scope: Client-only guards, generic auth service, OAuth/RBAC/session-store abstraction, broad adapter rewrite.
- Acceptance criteria: Decision is recorded; security boundary is stated as server-authoritative; docs no longer imply parity that does not exist; implementation issues are split only after the decision.
- Validation/checks: Review route-protection and deployment docs; define adapter regression checks before coding.
- Notes for implementation: This is a decision issue, not a coding issue. Keep product risk separate from security risk.

### 4. Confirm actual Vercel/Netlify runtime behavior

- Title: Confirm actual Vercel/Netlify runtime behavior for guarded routes and downloads
- Priority: High
- Severity: High
- Labels: `priority:high`, `area:adapters`, `area:router`, `area:tests`, `type:research`, `type:test`, `needs:confirmation`
- Suggested milestone: `M2: Hosted Adapter Trust`
- Problem: The audit evidence is docs/source based; actual hosted behavior needs targeted confirmation before implementation scope is chosen.
- Evidence: Follow-up plan marks hosted adapter behavior as needing confirmation; audit says route-check skip is not proven as a security bypass.
- Scope: Build or identify minimal hosted-target fixtures for guarded soft navigation, route-check availability, and `ctx.download()`.
- Out of scope: Fixing hosted adapters, changing auth behavior, adding client-only guards.
- Acceptance criteria: Current Vercel and Netlify behavior is recorded with repro steps; differences from node/local preview are explicit; follow-up implementation or docs issues are recommended.
- Validation/checks: Targeted adapter tests or reproducible build/deploy notes; docs diff if only the capability matrix changes.
- Notes for implementation: Treat this as product trust research. Do not exaggerate security impact without a confirmed bypass.

### 5. Pin package manager and CI toolchain versions

- Title: Pin package manager and CI toolchain versions
- Priority: Critical
- Severity: High
- Labels: `priority:critical`, `area:release`, `area:tooling`, `area:cli`, `type:maintenance`
- Suggested milestone: `M1: Release Discipline`
- Problem: Release reproducibility is under-specified for a native-package framework.
- Evidence: Audit found no root `packageManager`, CI/publish using `bun-version: latest`, CI on Node 20, and publish on Node 24.
- Scope: Declare package manager policy, pin Bun in CI/publish, and align or explicitly document Node version policy.
- Out of scope: Adding native targets, changing package APIs, redesigning publish architecture.
- Acceptance criteria: Toolchain versions are deterministic; CI and publish policy match docs; workflow syntax remains valid; release path still uses OIDC.
- Validation/checks: Workflow syntax/parse checks, `git diff --check`, file-size audit, targeted CI/release dry checks available locally.
- Notes for implementation: Keep this narrowly focused. If Node 20 vs 24 is intentional, document it rather than hiding it.

### 6. Publish a native-platform support matrix

- Title: Publish a native-platform support matrix
- Priority: High
- Severity: High
- Labels: `priority:high`, `area:release`, `area:docs`, `area:tooling`, `type:docs`, `type:decision`, `needs:decision`
- Suggested milestone: `M1: Release Discipline`
- Problem: Users cannot easily tell which native compiler/bundler platforms are supported or intentionally unsupported.
- Evidence: Audit found optional native packages for darwin arm64/x64, linux x64, and win32 x64, with no linux arm64 or win32 arm64 package.
- Scope: Document supported platforms and decide whether unsupported platforms should fail clearly, fall back, or be added later.
- Out of scope: Adding new platform packages unless separately approved; changing native package architecture.
- Acceptance criteria: Support matrix is visible in install/release docs; unsupported-platform behavior is documented; follow-up issues are created only for approved new targets.
- Validation/checks: Docs gates; package manifest review; optional install smoke notes for unsupported-platform behavior.
- Notes for implementation: This can be docs-first. Mark any platform expansion as a separate release-engineering project.

### 7. Define plugin trust model before expanding APIs

- Title: Define Plugin V1 trust model before expanding APIs
- Priority: High
- Severity: Medium
- Labels: `priority:high`, `area:plugins`, `area:security`, `area:docs`, `type:decision`, `type:docs`, `needs:decision`
- Suggested milestone: `M3: Plugin Trust Model`
- Problem: The current plugin story is safe but can sound larger than it is.
- Evidence: Audit found V1 plugins are config-time only, CLI plugin commands are read-only, registry entries are not installable, and config plugins execute trusted project code.
- Scope: Document Plugin V1 as config-time trusted code; separate discovery, install, config patching, and future hooks.
- Out of scope: Install/remove commands, compiler transforms, file transforms, dev-server mutation hooks, router lifecycle hooks, runtime DOM hooks.
- Acceptance criteria: Docs state plugins are not sandboxed; current capabilities are clear; future expansion does not weaken compiler/runtime invariants.
- Validation/checks: Docs gates; CLI docs examples match current plugin commands.
- Notes for implementation: Do this before icon implementation depends on plugin concepts.

### 8. Design first-party icon feature M1

- Title: Design first-party icon feature M1 with sanitized local SVG inputs
- Priority: Medium
- Severity: Medium
- Labels: `priority:medium`, `area:icons`, `area:plugins`, `area:security`, `type:decision`, `type:research`, `deferred`
- Suggested milestone: `M4: Icon Feature M1`
- Problem: Zenith has no official icon path, but a broad icon plugin would outrun the current extension contract.
- Evidence: Audit found no icon registry entry, raw SVG/static usage, and a plugin contract that blocks public compiler/file-transform hooks.
- Scope: Write an M1 design comparing build-time SVG sprite generation, first-party registry package, static imports, runtime component, compiler transform, and docs-only compatibility.
- Out of scope: Runtime-heavy icon component, remote icon fetching, public compiler transform plugin, general plugin expansion, implementation before priorities 1-4.
- Acceptance criteria: Recommendation covers bundle size, SSR, security, DX, basePath, unknown icon names, and why M1 should not depend on broad plugins.
- Validation/checks: Design review only; implementation tests to be specified for sanitizer rejection, deterministic sprite output, SSR/static output, and selected-icon bundling.
- Notes for implementation: Recommended path from the audit is build-time sprite generation with local sanitized inputs.

### 9. Add tests/docs for unsafe HTML behavior

- Title: Document and test the `unsafeHTML` trust boundary
- Priority: Medium
- Severity: Medium
- Labels: `priority:medium`, `area:runtime`, `area:security`, `area:docs`, `area:tests`, `type:security`, `type:test`
- Suggested milestone: `M5: Maintainability + Tests`
- Problem: `unsafeHTML` is an explicit unsanitized sink and should be treated as a named trust boundary.
- Evidence: Audit found normal `innerHTML` bindings are blocked, embedded markup has safety gates, and `unsafeHTML` writes directly to `node.innerHTML`.
- Scope: Add docs and focused tests/lints that make `unsafeHTML` intentional and hard to misuse.
- Out of scope: Silently sanitizing `unsafeHTML`, removing the escape hatch, broad runtime rewrite.
- Acceptance criteria: Docs distinguish safe embedded markup from `unsafeHTML`; tests demonstrate the boundary; optional strict-mode lint is specified or implemented narrowly.
- Validation/checks: Runtime tests if changed; docs gates; `git diff --check`; file-size audit.
- Notes for implementation: Do not call this an active framework vulnerability. The risk is untrusted app content passed to an explicit unsafe API.

### 10. Add Tailwind token/style enforcement

- Title: Add Tailwind token/style enforcement for `.zen` source examples
- Priority: Medium
- Severity: Medium
- Labels: `priority:medium`, `area:tailwind`, `area:docs`, `area:tests`, `type:maintenance`, `needs:confirmation`
- Suggested milestone: `M5: Maintainability + Tests`
- Problem: Tailwind token rules are contractual but not broadly enforced.
- Evidence: Audit found docs gates for framework syntax and DOM anti-patterns, but not hardcoded color/style-token drift; current dirty site worktree showed raw `rgb(...)`/`rgba(...)` values.
- Scope: Add a narrow style-token guard for docs/site `.zen` source, with SVG-safe exclusions.
- Out of scope: Styling redesign, banning all SVG literals, broad CSS architecture work.
- Acceptance criteria: Gate catches hardcoded colors/raw CSS variables in normal `.zen` markup; documented exceptions exist; current site branch is rechecked before enforcing.
- Validation/checks: New/updated docs gate, docs checks, file-size audit.
- Notes for implementation: Because some evidence came from a dirty site worktree, confirm current site state before making this blocking.

### 11. Continue file-size reduction slices for near-limit files

- Title: Continue file-size reduction slices for near-limit files
- Priority: Medium
- Severity: Medium
- Labels: `priority:medium`, `area:architecture`, `area:compiler`, `area:cli`, `area:runtime`, `type:maintenance`, `deferred`
- Suggested milestone: `M5: Maintainability + Tests`
- Problem: The touched-file policy works, but active files remain over or near the 500-line ceiling.
- Evidence: Audit found `packages/compiler/zenith_compiler/src/lexer.rs` at 541 lines and several active CLI/runtime/compiler files near 500 lines.
- Scope: Open one slice at a time, starting with a single file or cohesive helper boundary.
- Out of scope: Repo-wide modularization, abstraction-only refactors, generated output churn, unrelated architecture cleanup.
- Acceptance criteria: Each slice reduces or protects one target; behavior is unchanged; relevant tests/gates pass; no edited source file exceeds 500 lines.
- Validation/checks: `git diff --check`, file-size audit, plus target-specific checks such as compiler/runtime/CLI tests.
- Notes for implementation: This draft should seed narrow follow-up issues, not become one giant cleanup branch.

### 12. Improve compiler/parser maintainability without broad rewrite

- Title: Improve compiler/parser maintainability without broad rewrite
- Priority: Medium
- Severity: Medium
- Labels: `priority:medium`, `area:compiler`, `area:tests`, `type:maintenance`, `deferred`
- Suggested milestone: `M5: Maintainability + Tests`
- Problem: Compiler/parser behavior is well tested, but parser internals are concentrated in near-limit modules.
- Evidence: Audit found event semantics and diagnostics covered, while `lexer.rs`, `parser_embedded_markup.rs`, `transform.rs`, and related compiler files sit close to the line limit.
- Scope: Identify one low-risk helper extraction around lexer span/accounting or embedded markup lowering.
- Out of scope: Parser rewrite, diagnostic loosening, syntax changes, broad compiler architecture redesign.
- Acceptance criteria: Existing event/DOM diagnostics are unchanged; compiler JSON contract tests still pass; target files move away from the ceiling.
- Validation/checks: Rust compiler tests, CLI build-runtime contract tests, `node --check` where applicable, file-size audit.
- Notes for implementation: Use existing diagnostic tests as locks before moving code.

### 13. Clean up docs source-of-truth drift

- Title: Clean up docs source-of-truth drift in internal maintainability plans
- Priority: Medium
- Severity: Medium
- Labels: `priority:medium`, `area:docs`, `area:tooling`, `type:maintenance`, `deferred`
- Suggested milestone: `M5: Maintainability + Tests`
- Problem: Internal plans can route agents toward stale paths.
- Evidence: Audit found `docs/_internal/maintainability/oversized-file-refactor-plan.md` still referenced removed site paths after recent splits/site reset.
- Scope: Refresh stale internal references and consider a tiny check for tracked-file references in internal plans.
- Out of scope: Rewriting all internal docs, changing source code, rerunning Graphify, modifying generated output.
- Acceptance criteria: Removed paths are updated or marked historical; future plan freshness check is proposed or added narrowly; docs checks pass.
- Validation/checks: `git ls-files` reference check, docs gates, `git diff --check`, file-size audit.
- Notes for implementation: Treat current tree as authority. Do not act on stale plans without verifying files exist.

### 14. Clarify editor/language tooling roadmap

- Title: Clarify editor/language tooling roadmap
- Priority: Low
- Severity: Low
- Labels: `priority:low`, `area:tooling`, `area:dx`, `type:decision`, `type:docs`, `deferred`
- Suggested milestone: `M5: Maintainability + Tests`
- Problem: Editor/language support is not yet a clear public adoption lever.
- Evidence: Audit noted language packages are private and editor support needs roadmap clarity before being treated as part of public DX.
- Scope: Document current editor/language package status and decide whether public editor tooling is part of the next adoption push.
- Out of scope: Publishing editor packages, building a full language server roadmap, changing compiler APIs.
- Acceptance criteria: Docs or internal roadmap clearly state current status, non-goals, and next decision point.
- Validation/checks: Docs gates only unless package metadata changes are explicitly approved later.
- Notes for implementation: Keep this as roadmap clarity, not a hidden launch commitment.

### 15. Clean up Graphify schema expectations around empty edge data

- Title: Clean up Graphify schema expectations around empty edge data
- Priority: Low
- Severity: Low
- Labels: `priority:low`, `area:architecture`, `area:tooling`, `type:maintenance`, `type:docs`, `deferred`
- Suggested milestone: `M5: Maintainability + Tests`
- Problem: Root Graphify output is useful inventory, but current empty `edges` data can be misread as architecture evidence.
- Evidence: Audit found 7663 nodes, 14420 links, 58 hyperedges, and zero `edges` in `graphify-out/graph.json`.
- Scope: Clarify Graphify graph schema expectations and document that root graphs should not drive dependency claims until dependency edges are explicit.
- Out of scope: Full-repo Graphify architecture analysis, new eval runs, package ranking, broad architecture cleanup.
- Acceptance criteria: Documentation distinguishes nodes/links/hyperedges from dependency edges; package-scoped-first guidance is preserved.
- Validation/checks: Docs/internal plan checks; no Graphify run required unless separately requested.
- Notes for implementation: This should prevent over-reading tooling output, not create a new architecture process.

## Findings Not Converted Into Issues

- "Turn the security controls into a full security model doc" is partially covered by plugin trust and unsafe HTML drafts. A separate issue can wait until those land.
- "Examples gallery that doubles as integration coverage" is useful but too broad for the next push.
- "Known adapter differences page generated from adapter tests" should follow the hosted adapter decision and confirmation issues.
- "Marketing polish" should not be created until Getting Started is real.
