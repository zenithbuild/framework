# Zenith Roast Follow-up Plan

Source audit: `docs/_internal/audits/zenith-repo-roast-audit.md`
Date: 2026-07-03
Scope: planning only. No implementation, dependency install, manifest edit, or GitHub issue creation.

Audit completeness check: the audit includes the required executive summary, priority table, findings, icon recommendation, security notes, missing tests, suggested issues, and final CTO pushback. No required audit sections are missing.

Evidence boundaries:

- Hosted adapter parity is evidenced from docs and server-contract source. Actual Vercel/Netlify runtime behavior should be confirmed before implementation.
- Native package platform support is evidenced from package manifests. Whether linux arm64 or win32 arm64 should be supported needs product/release confirmation.
- Tailwind/style drift is partly evidenced from the current dirty site worktree. Recheck after that site branch settles.
- Icon support is evidenced as absent from the registry and current plugin contract. The exact API should be confirmed before code.

## Executive Decision

Recommended order of work:

1. Getting Started docs
2. Hosted adapter parity scope decision
3. Toolchain/package manager pinning
4. Plugin trust model
5. Icon feature M1
6. File-size and maintainability slices
7. Tailwind/style enforcement
8. Security documentation/linting

The first useful PR should be docs-first or toolchain-pinning-first. Do not start with compiler cleanup, broad plugin work, or the icon feature. The product problem is that Zenith is stronger after someone understands its invariants than before they have built their first app.

## Do Now

These are the issues that should be worked before the next public push.

### Add a real Getting Started quickstart

Issue title: Add a real Getting Started quickstart and verify the first-run path

Why now:
The audit found that `docs/documentation/getting-started/` contains only `_category.yml`. This is the clearest adoption gap and the fastest way to make Zenith easier to evaluate.

Files likely involved:

- `docs/documentation/getting-started/**`
- `docs/documentation/install-compatibility.md`
- `docs/scripts/gates/docs-structure.mjs` or adjacent docs gates if category coverage is enforced
- Possibly one smoke/example fixture, if a docs-following test is added

Risk level: Low/Medium. Content-only work is low risk, but it must not invent APIs or drift from shipped syntax.

Acceptance criteria:

- A new user can install/create/run a Zenith app from the page.
- The page includes one reactive component, one route, and one server `load(ctx)` example using canonical syntax.
- The docs avoid marketing copy and do not introduce a CMS, generic auth abstraction, or unsupported plugin story.
- Docs gates pass.

What not to do:
Do not write a landing page. Do not start with concepts. Do not promise hosted parity or plugin behavior that is still unresolved.

### Decide hosted adapter parity scope

Issue title: Decide hosted adapter parity scope for route-check and downloads

Why now:
The audit found documented gaps for hosted `vercel` and `netlify`: route-check is skipped, hosted downloads return 501, and hosted adapter auth parity remains deferred. This is a trust issue for deployment users.

Files likely involved:

- `docs/documentation/routing/route-protection.md`
- `docs/documentation/guides/deployment-targets.md`
- Adapter docs and tests for Vercel/Netlify
- `packages/cli/src/server-runtime/**` and adapter packaging code only after the decision is made

Risk level: Medium/High. The decision is low risk; implementation can touch routing and adapter behavior.

Acceptance criteria:

- The team chooses one milestone: close parity now, or explicitly ship a capability matrix with clear CLI/docs warnings.
- The decision distinguishes advisory client preflight from the real server security boundary.
- Tests are specified for guarded navigation and `ctx.download()` on hosted targets.
- If implementation is deferred, the docs make the limitation unmissable.

What not to do:
Do not add client-only guards. Do not claim hosted adapters are equivalent until tests prove it.

### Pin toolchain and package manager behavior

Issue title: Pin toolchain versions and publish a native-platform support matrix

Why now:
Zenith ships native compiler/bundler packages. The audit found no root `packageManager`, floating `bun-version: latest`, Node 20 in CI, Node 24 in publish, and an implicit native support matrix.

Files likely involved:

- `package.json`
- `.github/workflows/reusable-ci.yml`
- `.github/workflows/publish.yml`
- Install or compatibility docs
- Native package docs/tests for unsupported platforms

Risk level: Medium. This affects CI/release behavior and should be validated carefully.

Acceptance criteria:

- Root package manager is declared.
- CI and publish use pinned Bun behavior.
- Node version policy is aligned or explicitly documented.
- Native platform support matrix is documented.
- Unsupported-platform behavior is intentional and tested or explicitly deferred.

What not to do:
Do not expand native targets casually. Do not edit manifests without release validation.

### Clarify the Plugin V1 trust model

Issue title: Clarify Plugin V1 as config-time trusted code and separate discovery from install

Why now:
The plugin surface is intentionally safe, but the product language can imply more than exists. The registry lists official non-installable plugins, and CLI commands are metadata-only.

Files likely involved:

- `docs/documentation/contracts/extension-contract.md`
- Plugin CLI docs
- `packages/extension-registry/registry.json` only if wording/metadata needs alignment
- Security/trust-boundary docs

Risk level: Low/Medium. Mostly docs, but it changes user expectations around plugins.

Acceptance criteria:

- Docs clearly state that V1 plugins are config-time only.
- Docs state configured plugins are trusted project code, not sandboxed extensions.
- Discovery, install, config patching, and future hooks are separated.
- The docs explicitly reject compiler transforms, dev-server mutation hooks, router lifecycle hooks, and runtime DOM hooks for V1.

What not to do:
Do not add install commands. Do not open compiler/runtime hooks to make the plugin story feel bigger.

## Do Later

Valid work that should not block the next public push:

- Icon feature M1 implementation, after Getting Started, hosted parity decision, toolchain pinning, and plugin trust docs are settled.
- File-size slices for `packages/compiler/zenith_compiler/src/lexer.rs` and near-limit CLI/runtime files.
- Tailwind/style enforcement for `.zen` source once current site worktree stabilizes.
- Security documentation and optional strict-mode linting for `unsafeHTML`.
- Internal maintainability plan freshness checks for deleted/renamed paths.
- Graphify schema cleanup so root graphs expose dependency edges before architecture gating.
- Public language/editor tooling roadmap while language packages remain private.
- Examples gallery that doubles as integration coverage.

## Do Not Do Yet

Tempting work that would cause drift:

- General-purpose plugin API expansion
- Runtime-heavy icon system
- Broad parser rewrite
- Broad architecture cleanup
- Styling redesign
- Marketing polish before first-run docs
- CMS integration
- Generic auth abstraction
- Full-repo Graphify-driven architecture work
- Compiler transform hooks for icons or content

## Proposed GitHub Issues

### Issue 1

Title: Add a real Getting Started quickstart and verify the first-run path

Problem:
The Getting Started category is effectively empty. New users meet advanced contracts before they get a working app.

Evidence from audit:
`docs/documentation/getting-started/` contains only `_category.yml`. The audit identifies first-run docs as the top product/DX gap.

Scope:

- Add a concise quickstart under `docs/documentation/getting-started/`.
- Cover install/create/run, one reactive component, one route, and one server `load(ctx)`.
- Link to existing install compatibility and routing/reactivity docs.
- Add a docs gate or smoke expectation if feasible.

Out of scope:

- Marketing hero work
- New framework APIs
- Hosted parity promises
- Plugin or icon implementation

Acceptance criteria:

- A fresh user can follow the page to a running app.
- All snippets use canonical Zenith syntax.
- Docs structure/syntax checks pass.
- No unsupported APIs or future features are introduced.

Test/docs expectations:
Run docs structure and syntax gates. If snippet tooling is available, run snippet checks. Add a first-run smoke only if it stays narrow.

### Issue 2

Title: Decide hosted adapter parity scope for route-check and downloads

Problem:
Hosted Vercel/Netlify behavior is documented as incomplete for advisory route-check and downloads. Users need either parity or an explicit, tested limitation.

Evidence from audit:
`route-protection.md` says hosted adapter auth parity remains deferred and hosted adapters skip advisory route-check. `deployment-targets.md` says hosted `ctx.download()` returns 501.

Scope:

- Confirm current Vercel and Netlify behavior.
- Decide whether the milestone implements parity or documents a capability matrix with warnings.
- Define tests for guarded soft navigation and hosted downloads.
- Update docs to reflect the decision.

Out of scope:

- Client-only guards
- Generic auth service
- OAuth/RBAC/session-store abstraction
- Broad adapter rewrite

Acceptance criteria:

- Decision is recorded.
- Security boundary is stated: server response remains authoritative.
- Hosted behavior is either implemented with tests or documented as an explicit limitation.
- No docs imply parity that does not exist.

Test/docs expectations:
Add or specify adapter tests for route-check and downloads. Update deployment and route-protection docs.

### Issue 3

Title: Pin toolchain versions and publish a native-platform support matrix

Problem:
Release reproducibility is under-specified for a framework that ships native packages.

Evidence from audit:
Root `package.json` lacks `packageManager`; CI and publish use `bun-version: latest`; CI uses Node 20 while publish uses Node 24; native optional dependencies cover only darwin arm64/x64, linux x64, and win32 x64.

Scope:

- Declare package manager policy.
- Pin Bun in CI and publish workflows.
- Align or document Node version policy.
- Document supported native platforms.
- Define unsupported-platform install behavior.

Out of scope:

- Adding new native targets unless separately approved
- Reworking publish architecture
- Changing package APIs

Acceptance criteria:

- Toolchain versions are deterministic.
- Native support matrix is visible to users.
- CI/publish behavior matches the documented policy.
- Unsupported platforms fail or fallback intentionally.

Test/docs expectations:
Run workflow syntax checks, file-size audit, and targeted release/package tests. Add install docs for platform support.

### Issue 4

Title: Clarify Plugin V1 as config-time trusted code and separate discovery from install

Problem:
The plugin surface is intentionally narrow, but the current registry/docs can imply a larger ecosystem than exists.

Evidence from audit:
The extension contract closes compiler/file-transform/router/runtime hooks. CLI plugin commands are read-only. Registry entries are official but not installable.

Scope:

- Clarify Plugin V1 in docs.
- State configured plugin hooks execute trusted project code.
- Separate discovery, install, config patching, and future hooks.
- Align registry wording if needed.

Out of scope:

- Plugin install/remove commands
- Compiler transforms
- Dev-server mutation hooks
- Router lifecycle hooks
- Runtime DOM hooks

Acceptance criteria:

- Users understand what plugins can and cannot do today.
- Docs do not imply sandboxing.
- Future plugin ideas do not weaken current invariants.

Test/docs expectations:
Run docs gates. Add CLI docs examples only if they match current behavior.

### Issue 5

Title: Design a first-party icon M1 with sanitized local SVG inputs

Problem:
Zenith has no official icon path. Users will hand-roll SVGs or import runtime-heavy libraries unless the framework offers a narrow, safe option.

Evidence from audit:
The registry has no icon plugin. Existing usage is raw SVG/static assets. The plugin contract blocks public compiler/file transform hooks, so icons should not be the reason to expand the plugin API.

Scope:

- Write an icon M1 proposal.
- Prefer build-time SVG sprite generation or a first-party icon registry package.
- Require local inputs only.
- Define sanitizer, manifest, SSR/static output, basePath, and unknown-name behavior.

Out of scope:

- Runtime-heavy icon component
- Remote icon fetching
- Public compiler transform plugin
- General-purpose plugin expansion
- Full icon implementation before priorities 1-4 are settled

Acceptance criteria:

- M1 recommendation is approved before code.
- Bundle-size, SSR, security, and DX tradeoffs are documented.
- The plan explains why it does not depend on broad plugin expansion.

Test/docs expectations:
Specify tests for sanitizer rejection, deterministic sprite output, selected-icon bundling, SSR/static output, basePath, and unknown icon names.

## Icon Feature M1

M1 should not be a broad plugin system.

| Option | Bundle-size impact | SSR behavior | Security | DX | Verdict |
|---|---|---|---|---|---|
| First-party icon registry package | Good if manifest selects icons only | Good if build emits deterministic assets | Good if package data is local and sanitized | Strong discoverability | Good wrapper around build-time sprite path |
| Build-time SVG sprite generation | Best: selected symbols only | Best: deterministic static/SSR output | Strong if sanitizer rejects active SVG content | Good with `<Icon name="">` and clear errors | Recommended M1 |
| Static imports | Good per icon, but repetitive | Good | Depends on source package and import path | Familiar but no framework-level consistency | Acceptable interim docs path |
| Runtime icon component | Risk of over-bundling icon packs | Works, but shifts work to client/runtime | Depends on library behavior | Easy at first | Not M1 |
| Compiler transform | Could be optimal | Could be optimal | Risky because it opens a broad hook class | Magic and harder to debug | Do not do now |
| Third-party icon compatibility docs only | No framework bundle impact | Depends on user choices | Depends on user choices | Low effort, incomplete | Interim note only |

Recommendation:
Use build-time SVG sprite generation, optionally exposed through a first-party icon registry package. Inputs should be local installed packages or explicit local SVG directories. The build should emit a deterministic sanitized sprite and manifest, and UI should use a small `<Icon name="collection:name" />` surface or equivalent helper.

Bundle-size impact:
Only selected icons should be emitted. Do not import whole icon packs into the runtime.

SSR behavior:
SSR/static output should be deterministic and should not require client fetches. Unknown icons should fail early in dev/build where possible.

Security considerations:
Reject scripts, inline event attributes, `foreignObject`, remote references, and unsafe URL attributes by default. Do not fetch icons remotely at build time.

DX:
The API should be boring: named icons, useful unknown-name diagnostics, basePath-safe output, and no plugin ceremony for common usage.

Plugin dependency:
Do not depend on broad plugin expansion. Icons can later integrate with the plugin story, but M1 should be first-party and closed enough to preserve Zenith's current invariants.

## Hosted Adapter Parity Decision

### What currently works

- The server contract runs `guard(ctx)` before `load(ctx)` or `action(ctx)`.
- Guard/load/action result shapes are validated.
- Routes with guard/load/action cannot be statically prerendered.
- Local dev, local preview, and packaged `node` expose the documented route-check behavior.
- Hosted targets support some server capabilities such as multipart/form-data, resource-route stream, and SSE according to current docs.

### What is explicitly incomplete

- Hosted `vercel` and `netlify` skip advisory route-check.
- Hosted `ctx.download()` returns 501.
- Hosted adapter auth parity is documented as deferred.

### Risk classification

Security risk:
Not proven by the audit. The direct same-origin HTML request remains the authoritative server boundary.

Product risk:
High. Users will judge Vercel/Netlify support by whether guarded navigation and resource routes feel consistent with local preview and node.

Needs confirmation:
Run targeted hosted adapter checks before deciding implementation scope. The audit evidence is strong enough to require a decision, not enough to prescribe code.

### Smallest trustworthy milestone

Create a test-backed hosted capability decision:

- Confirm current Vercel and Netlify behavior.
- Publish a capability matrix for route-check and downloads.
- Either implement route-check/download parity for both hosted adapters, or surface explicit CLI/docs warnings when a project uses unsupported hosted capabilities.
- Add regression tests so the matrix cannot silently drift.

## Final Recommendation

What should be merged next:
Merge a docs-first quickstart PR or a toolchain-pinning PR. If release timing is urgent, do toolchain pinning first; otherwise start with Getting Started docs because it fixes the clearest adoption failure.

What should wait:
Icon implementation, file-size refactors, Tailwind enforcement, Graphify schema cleanup, and editor tooling should wait until the first-run path, hosted parity decision, and release reproducibility are under control.

What would be dangerous scope creep:
Broad plugin APIs, runtime-heavy icon systems, parser rewrites, architecture cleanup branches, design-system work, CMS work, generic auth, and marketing polish before a working quickstart.

What would make Zenith easier to adopt fastest:
A short quickstart that gets a new user to a running app using canonical Zenith syntax, paired with honest deployment capability docs and deterministic install/release tooling.
