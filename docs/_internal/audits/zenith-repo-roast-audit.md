# Zenith Repo Roast Audit

Date: 2026-07-03
Scope: read-only repo audit, plus this report file.
Method: AGENTS.md contract review, existing Graphify graph inspection, targeted source reads, line-count scan, static searches, package/workflow inventory, and validation commands.

## Executive Summary

Zenith is not a toy framework. The core has real compiler/runtime contracts, a server-authoritative routing model, serious image SSRF controls, OIDC npm publishing, and a growing regression suite. The weak point is not ambition. The weak point is product focus and release discipline: the repo has strong internals, but the first-run path, hosted adapter parity, plugin story, icon story, toolchain pinning, and styling enforcement are not yet as mature as the core architecture.

The uncomfortable truth: the framework is strongest where a contributor already fought through the invariants, and weakest where a new user would first touch it. There is no meaningful Getting Started content under the Getting Started category. Hosted `vercel` and `netlify` behavior is documented as incomplete for advisory route-check and downloads. Plugins are intentionally safe and closed, but the registry is mostly a future-facing signpost. The icon story is absent enough that users will either hand-roll SVGs or import a runtime-heavy library ad hoc.

Strengths:

- Compiler event rules are implemented, tested, and surfaced through structured diagnostics.
- Runtime hydration, cleanup, event binding, and embedded markup safety are split into auditable modules.
- Guard/load/action behavior is server-authoritative and validates result shape.
- Image remote fetch hardening is better than many young frameworks: allowlist matching, private-network blocking, DNS resolution, pinned fetch target, redirect revalidation, SVG blocking by default.
- Release uses npm Trusted Publishing/OIDC and registry verification rather than token-based publish auth.
- File-size policy exists and the touched-file audit is already a useful guardrail.

Risks:

- New-user adoption is undercut by an empty `docs/documentation/getting-started/` category.
- Hosted adapter parity is still explicitly deferred in places that matter for auth UX and downloads.
- Toolchain reproducibility is not tight enough for a native-package framework: root has no `packageManager`, CI and publish use `bun-version: latest`, and CI uses Node 20 while publish uses Node 24.
- Plugin and icon expectations are ahead of the shipped extension surface.
- Maintainability pressure is still visible in near-limit parser, CLI, runtime, and release files.
- Tailwind token discipline is mostly contractual, not enforced broadly enough.

Top 5 priorities:

1. Ship a real first-run Getting Started path before more advanced docs polish.
2. Close or explicitly product-scope hosted adapter parity for route-check and downloads.
3. Pin the package manager/toolchain story and publish support matrix before the next major public push.
4. Define the plugin trust model before adding richer extension APIs; ship icons as a narrow first-party build-time feature, not a general compiler plugin.
5. Continue issue-backed file-size slices, but do not start a broad architecture cleanup.

## Priority Table

| Priority | Area | Issue | Severity | Confidence | Suggested Milestone |
|---:|---|---|---|---|---|
| 1 | Product/DX | Getting Started category has no user-facing docs | High | High | Next docs sprint |
| 2 | Router/Adapters | Hosted route-check and downloads are documented as incomplete | High | High | Adapter parity milestone |
| 3 | Release/Packaging | Toolchain and native-platform reproducibility are under-specified | High | High | Before next release train |
| 4 | Plugin System | Extension surface is safe but too thin for the expectations implied by registry/docs | Medium | High | Plugin V1 hardening |
| 5 | Icon Feature | No official icon path exists; users will hand-roll or over-bundle | Medium | High | Plugin/Icon M1 |
| 6 | Maintainability | Near-limit source files remain across compiler, CLI, runtime, and release scripts | Medium | High | Ongoing issue-backed slices |
| 7 | Compiler/Parser | Parser internals are strong but close to file-size ceiling | Medium | High | Compiler maintainability pass |
| 8 | Runtime/Security | `unsafeHTML` is an explicit unsanitized sink | Medium | High | Security docs/lint pass |
| 9 | Tailwind/Styling | Token discipline lacks broad automated enforcement | Medium | Medium | Site/docs quality gate |
| 10 | Docs/Generated AI | Docs gates exist, but stale internal plans and generated docs can drift from current tree | Medium | High | Docs source-of-truth cleanup |
| 11 | Graphify/Architecture | Existing root graph has links, but zero `edges`; do not over-read it as architecture proof | Low | High | Graphify schema cleanup |
| 12 | Language Tooling | Language packages are private; editor support is not yet a public adoption lever | Low | Medium | Editor tooling milestone |

## Findings

### Finding 1: The first-run docs path is empty

Area: Product/DX, docs
Severity: High
Confidence: High
Files inspected: `docs/documentation/getting-started/_category.yml`, `docs/documentation/`, `docs/scripts/gates/docs-structure.mjs`

What I found:
`docs/documentation/getting-started/` contains only `_category.yml`. There is no actual Getting Started page in that category.

Why it matters:
Zenith has advanced contracts for route protection, reactivity, embedded markup, adapters, images, and plugins. Without a crisp first-run path, a new user meets the framework through internals instead of success. That makes the framework feel harder than it is.

Evidence:
- `find docs/documentation/getting-started -maxdepth 2 -type f` returned only `docs/documentation/getting-started/_category.yml`.
- `docs/scripts/gates/docs-structure.mjs:26-78` validates existing doc structure, but it does not require category coverage or a first-run tutorial.

Recommended fix:
Add a short, canonical path: install, create app, run dev, create one reactive component, add one route, add one server `load(ctx)`, deploy target note. Back it with docs gates and one smoke fixture.

What not to do:
Do not solve this with a marketing page, a large concepts article, or another internal contract. The first page should get a user to a working app fast.

Suggested issue title:
Add a real Getting Started quickstart and enforce non-empty starter docs category.

### Finding 2: Hosted adapter parity is still explicitly incomplete

Area: Router, guard/load, hosted adapters
Severity: High
Confidence: High
Files inspected: `docs/documentation/routing/route-protection.md`, `docs/documentation/guides/deployment-targets.md`, `packages/cli/src/server-contract/resolve.js`, `packages/cli/src/route-classification.js`

What I found:
The server route contract is solid, but hosted adapter parity is not complete. Docs say auth contract support exists in local dev, local preview, and packaged `node`, while hosted adapter auth parity remains deferred. Docs also state hosted `vercel` and `netlify` skip advisory route-check and hosted downloads return 501.

Why it matters:
The security boundary is still the direct server response, so this is not an auth bypass from the inspected evidence. But it is a product trust issue. Users will expect local preview, node, Vercel, and Netlify to behave consistently for guarded navigation and resource routes.

Evidence:
- `docs/documentation/routing/route-protection.md:182` says hosted adapter auth parity remains deferred.
- `docs/documentation/routing/route-protection.md:285-294` says route-check is advisory and hosted Vercel/Netlify skip it.
- `docs/documentation/guides/deployment-targets.md:114-116` says hosted targets skip route-check and `ctx.download()` returns 501.
- `packages/cli/src/server-contract/resolve.js:162-180` runs guard before load/action and short-circuits redirect/deny.
- `packages/cli/src/route-classification.js:7-17` rejects prerender with guard/load/action.

Recommended fix:
Pick one: either close hosted route-check/download parity or make hosted limitations impossible to miss in CLI output and deployment docs. Add adapter-level regression tests for guarded soft navigation and downloads.

What not to do:
Do not market hosted adapters as behaviorally equivalent until these gaps are closed. Do not add client-only guards as a workaround.

Suggested issue title:
Close hosted adapter parity for guarded route-check and resource downloads.

### Finding 3: Release reproducibility is not tight enough for native packages

Area: CLI/build, release, package architecture
Severity: High
Confidence: High
Files inspected: `package.json`, `.github/workflows/reusable-ci.yml`, `.github/workflows/publish.yml`, `packages/compiler/package.json`, `packages/bundler/package.json`, platform package manifests

What I found:
Root `package.json` has no `packageManager`. CI and publish use `bun-version: latest`. CI uses Node 20 while publish uses Node 24. Compiler and bundler optional native packages cover darwin arm64/x64, linux x64, and win32 x64, but not linux arm64 or win32 arm64.

Why it matters:
Zenith ships native compiler/bundler packages. Floating package-manager behavior and a partially implicit support matrix raise release risk. A bad Bun latest, Node mismatch, or unsupported platform can become a user install failure rather than a framework bug.

Evidence:
- `package.json:1-27` has workspaces and scripts but no `packageManager`.
- `.github/workflows/reusable-ci.yml:18-24` uses Node 20 and `bun-version: latest`.
- `.github/workflows/publish.yml:44-47` and `211-218` use Node 24 and `bun-version: latest`.
- `.github/workflows/publish.yml:220-227` correctly blocks token-based npm auth and requires OIDC.
- `packages/compiler/package.json:33-38` and `packages/bundler/package.json:42-47` list optional native packages for only four platform packages.

Recommended fix:
Declare a root `packageManager`, pin Bun in CI/publish, align or explicitly document Node versions, and publish a support matrix. If linux arm64 is intentionally unsupported, say so in install docs and test the error path.

What not to do:
Do not treat "works on CI today" as a release contract. Do not expand native targets without adding install and smoke verification.

Suggested issue title:
Pin toolchain versions and publish a native-platform support matrix.

### Finding 4: The plugin surface is safe, but too thin for the product story

Area: Plugin system, package architecture
Severity: Medium
Confidence: High
Files inspected: `docs/documentation/contracts/extension-contract.md`, `packages/extension-registry/registry.json`, `packages/cli/src/commands/plugin/index.ts`, `packages/cli/src/config-plugins.js`, `packages/cli/src/config.js`

What I found:
The V1 extension contract is intentionally config-time only. The CLI plugin namespace is read-only: list, search, info. The registry has official adapter/plugin entries, all `installable: false`. Config plugins can patch only a small set of keys.

Why it matters:
This is a good safety stance, but it means the current plugin story is mostly discovery and configuration, not an ecosystem. If users hear "plugin" and expect transforms, installers, or runtime hooks, the docs are promising more than the system should ship today.

Evidence:
- `docs/documentation/contracts/extension-contract.md:12-27` closes compiler, file-transform, router lifecycle, and runtime hook surfaces.
- `docs/documentation/contracts/extension-contract.md:41-52` says discovery commands are read-only and install/remove/config mutation are future work.
- `packages/extension-registry/registry.json:24-40` lists image/content plugins as official but not installable.
- `packages/cli/src/commands/plugin/index.ts:6-33` exposes only list/search/info.
- `packages/cli/src/config-plugins.js:4-12` limits patchable config keys.

Recommended fix:
Keep the extension surface narrow, but rename expectations in docs and CLI output. Document that plugins are trusted project code when configured. Add a small V1 roadmap that separates discovery, install, config patch, and future hooks.

What not to do:
Do not add compiler transforms, dev-server mutation hooks, or runtime DOM hooks to make the plugin story feel bigger. That would weaken Zenith's best invariants.

Suggested issue title:
Clarify Plugin V1 as config-time trusted code and separate discovery from install.

### Finding 5: Zenith needs an icon feature, not a broad icon plugin API

Area: Icon feature/plugin recommendation
Severity: Medium
Confidence: High
Files inspected: `packages/extension-registry/registry.json`, `docs/documentation/contracts/extension-contract.md`, `packages/cli/src/images/service.js`, `packages/cli/src/static-mime.js`, `site/src/components/Hero.zen`

What I found:
There is no official icon plugin or icon feature. Existing usage is raw SVG/static assets. The registry has image/content placeholders, but no icon entry. The current plugin contract does not allow file transforms or compiler hooks, so a "normal" icon plugin would either overreach the contract or become a runtime wrapper.

Why it matters:
Icons are table stakes for app UI. Without a first-party path, users will paste inline SVGs everywhere, import heavy runtime icon libraries, or invent incompatible conventions.

Evidence:
- `packages/extension-registry/registry.json:24-40` has image/content plugin placeholders, no icons.
- `docs/documentation/contracts/extension-contract.md:21-25` blocks public compiler, transform, router, and runtime hooks.
- `packages/cli/src/images/service.js:284-285` blocks SVG image optimization unless `images.allowSvg` is enabled; that is image safety, not an icon system.
- Repo search found raw SVG use in docs/site, not a reusable icon abstraction.

Recommended fix:
Ship an explicit first-party icon M1 as a build-time asset feature or framework component:

- Config: `icons: { collections: [...] }` or a first-party `@zenithbuild/icons` package, not a generic plugin hook.
- Inputs: local installed packages or explicit local SVG paths only; no remote fetching.
- Build output: deterministic sanitized symbol sprite/manifest.
- UI: `<Icon name="collection:name" />` or a tiny `icon()` helper that renders static SVG markup.
- Safety: sanitize SVG, reject scripts/events/foreignObject by default, require explicit allowlist for custom paths.

What not to do:
Do not make icons the reason to open compiler transform hooks. Do not ship a runtime wrapper that imports full icon packs. Do not fetch icons remotely at build time.

Suggested issue title:
Design a first-party build-time icon feature with sanitized local SVG inputs.

### Finding 6: File-size pressure is real but mostly being managed

Area: Maintainability, package architecture
Severity: Medium
Confidence: High
Files inspected: full source line-count scan excluding generated/vendor, `scripts/file-size-audit.mjs`, current `git status`

What I found:
The touched-file audit passes, and several old oversized targets are already split or removed in the current tree. But active near-limit files remain: `packages/compiler/zenith_compiler/src/lexer.rs` is 541 lines, `packages/cli/src/manifest.js` is 499, `packages/compiler/zenith_compiler/src/parser_embedded_markup.rs` is 498, `packages/runtime/src/template.js` is 496, and multiple CLI/runtime tests are near 500.

Why it matters:
The repo is correctly avoiding 2k-line source files, but it is still close to policy edges. Near-limit files become "just one more helper" traps unless issue-backed slices continue.

Evidence:
- Current scan found 147165 maintained lines after excluding `node_modules`, `dist`, `target`, `.zenith*`, `.git`, and `graphify-out`.
- `packages/compiler/zenith_compiler/src/lexer.rs` is 541 lines.
- `packages/cli/src/manifest.js` is 499 lines.
- `packages/compiler/zenith_compiler/src/parser_embedded_markup.rs` is 498 lines.
- `docs/scripts/generate-ai-endpoints.mjs` is now 453 lines and `apps/benchmarks/scripts/run-bundle-analysis.mjs` is now 360 lines; the prior oversized target paths `site/src/server/documentationSource.ts` and `site/scripts/zenith-workspace.mjs` are no longer tracked in this checkout.
- File-size audit passed for the current diff.

Recommended fix:
Keep cutting one target per issue-backed PR. Start with files over 500 or repeatedly touched files at 480-500. Prefer pure helper extraction plus behavior checks.

What not to do:
Do not do a "repo modularization" PR. Do not create abstractions just to reduce line count.

Suggested issue title:
Continue issue-backed file-size reductions for compiler lexer and near-limit CLI/runtime files.

### Finding 7: Compiler/parser correctness is stronger than its maintainability shape

Area: Compiler/parser
Severity: Medium
Confidence: High
Files inspected: `packages/compiler/zenith_compiler/src/parser_elements.rs`, `event_contract.rs`, `script_dom_lint.rs`, `parser_embedded_markup.rs`, `lexer.rs`, `packages/compiler/zenith_cli/tests/json_contract.rs`, `packages/cli/tests/build-runtime-contract.spec.js`

What I found:
Event contract behavior is implemented and tested: direct event calls fail, string event handlers fail, aliases normalize, unknown events warn with suggestions, and build output propagates compiler warnings. DOM anti-pattern lints also exist. The problem is not missing semantics; it is that the parser/compiler implementation is concentrated in near-limit modules.

Why it matters:
Zenith's syntax is deliberately not React/Svelte/Vue. Parser drift would be expensive because users depend on exact diagnostics and contract rules. The current tests lower that risk, but maintainability pressure should not be ignored.

Evidence:
- `packages/compiler/zenith_compiler/src/parser_elements.rs:115-147` rejects direct call handlers and string event handlers.
- `packages/compiler/zenith_compiler/src/event_contract.rs:3-9` defines supported aliases.
- `packages/compiler/zenith_cli/tests/json_contract.rs:193-228` asserts structured invalid-event errors and unknown-event warnings.
- `packages/cli/tests/build-runtime-contract.spec.js:235-262` asserts compiler warnings print during build.
- `packages/compiler/zenith_compiler/src/script_dom_lint.rs:71-134` warns on query selectors, direct event listeners, and wrapper globals.

Recommended fix:
Continue small parser module extractions, especially around lexer span/accounting and embedded markup lowering. Lock each split with existing diagnostic tests.

What not to do:
Do not rewrite the parser. Do not loosen diagnostics to simplify implementation.

Suggested issue title:
Split compiler lexer/parser helpers without changing event or DOM lint diagnostics.

### Finding 8: Runtime safety is solid, but `unsafeHTML` is exactly what it says

Area: Runtime/reactivity, security
Severity: Medium
Confidence: High
Files inspected: `packages/runtime/src/render.js`, `packages/runtime/src/markup.js`, `packages/runtime/src/events.js`, `packages/runtime/src/cleanup.js`, `packages/runtime/tests/maintainability-locks.spec.js`

What I found:
The runtime blocks normal `innerHTML` bindings, escapes string interpolation, rejects scripts/inline events/javascript URLs in embedded markup, and centralizes event listener cleanup. It still exposes `unsafeHTML`, which writes directly to `node.innerHTML`.

Why it matters:
This is not a framework vulnerability by itself. It is an explicit unsafe boundary. But it is a real XSS sink if application code passes untrusted HTML. The docs and lints should make that boundary impossible to miss.

Evidence:
- `packages/runtime/src/render.js:228-242` rejects `innerHTML` but permits `unsafeHTML`.
- `packages/runtime/src/markup.js:67-91` blocks script tags, inline handlers, and javascript URLs in embedded markup.
- `packages/runtime/src/markup.js:157-186` rejects unsafe URL protocols after entity/control-character normalization.
- `packages/runtime/src/events.js:142-145` registers DOM listeners through the runtime cleanup path.
- `packages/runtime/src/cleanup.js:55-85` removes listeners/disposers and resets side effects.

Recommended fix:
Add a docs section and lint/test coverage that treats `unsafeHTML` as an explicit trust boundary. Consider requiring an inline comment escape hatch in strict mode.

What not to do:
Do not silently sanitize `unsafeHTML`; that creates false confidence and inconsistent output. Do not remove the escape hatch unless the framework has a sanctioned rich-content alternative.

Suggested issue title:
Document and lint the `unsafeHTML` trust boundary in strict DOM mode.

### Finding 9: Tailwind token discipline is contractual, not enforced enough

Area: Tailwind/styling, site
Severity: Medium
Confidence: Medium
Files inspected: `AGENTS.md`, `docs/scripts/gates/shared.mjs`, current dirty `site/src/components/Hero.zen`, current dirty `site/src/components/ZenithLogoMark.zen`

What I found:
The contract says to use Tailwind tokens and avoid raw CSS variables or hardcoded hex unless Tailwind config defines them. Docs gates catch framework syntax and DOM anti-patterns, but I did not find a broad style-token gate for `.zen` source. The current dirty site worktree already contains raw `rgb(...)`/`rgba(...)` inline styles in new/modified site components.

Why it matters:
Design-token drift is a product-quality problem, not just style preference. If the site is allowed to bypass the same contract the framework teaches, examples will normalize the wrong patterns.

Evidence:
- `AGENTS.md` contract forbids hardcoded colors unless defined through Tailwind.
- `docs/scripts/gates/shared.mjs:25-38` checks forbidden framework syntax, but not hardcoded color/token drift.
- `docs/scripts/gates/shared.mjs:84-91` checks DOM anti-pattern labels.
- Current dirty files under `site/src/components/Hero.zen` and `site/src/components/ZenithLogoMark.zen` include raw `rgb(...)`/`rgba(...)` values. These were pre-existing working-tree changes and were not modified by this audit.

Recommended fix:
Add a narrow `.zen` style-token lint for source files, excluding SVG path data and intentionally documented exceptions. Run it on docs examples and site components.

What not to do:
Do not try to ban all SVG literals. Do not replace this with manual review only.

Suggested issue title:
Add a Tailwind token guard for `.zen` source styles and examples.

### Finding 10: Security posture is better than expected, but trust boundaries need names

Area: Security, CLI/build
Severity: Medium
Confidence: High
Files inspected: `packages/cli/src/images/remote-fetch.js`, `packages/cli/src/images/shared.js`, `packages/cli/src/images/service.js`, `packages/cli/src/public-assets.js`, `packages/cli/src/config.js`, `packages/cli/src/config-plugins.js`

What I found:
No confirmed active SSRF/path traversal/auth-bypass issue surfaced in the inspected code. The image fetch path blocks private networks by default, pins resolved addresses, revalidates redirects, and blocks remote SVG unless opted in. Public asset copying skips symlinks and resolves destinations inside `outDir`. Config/plugin loading executes project code, which is normal for config files but should be named as trusted code.

Why it matters:
The code has good controls. The documentation should teach the same threat model: remote image fetching is guarded, `unsafeHTML` is unsafe, and plugins/config are trusted local code, not sandboxed extensions.

Evidence:
- `packages/cli/src/images/shared.js:13-24` defaults to no remote patterns, `allowSvg: false`, byte/pixel caps, and no local network fetch.
- `packages/cli/src/images/remote-fetch.js:122-145` blocks loopback/private DNS results unless explicitly allowed.
- `packages/cli/src/images/remote-fetch.js:255-275` revalidates every redirect target.
- `packages/cli/src/images/service.js:280-291` requires image content type, blocks SVG by default, and enforces pixel cap.
- `packages/cli/src/public-assets.js:46-58` skips symlinks and suspicious relative paths; `123-127` keeps destinations inside `outDir`.
- `packages/cli/src/config.js:109-155` imports/transpiles project config code; `269-304` executes plugin config hooks with a frozen snapshot and normalized patch.

Recommended fix:
Add a security model doc that names these trust boundaries and links to tests. Make "trusted project code" explicit for config plugins.

What not to do:
Do not claim plugins are sandboxed. Do not weaken image fetch controls for convenience.

Suggested issue title:
Document Zenith security trust boundaries for images, config plugins, and unsafe HTML.

### Finding 11: Docs source-of-truth has stale internal references

Area: Docs/examples/demos, maintainability
Severity: Medium
Confidence: High
Files inspected: `docs/_internal/maintainability/oversized-file-refactor-plan.md`, current tracked file list, docs gates

What I found:
Internal maintainability planning still references `site/src/server/documentationSource.ts` and `site/scripts/zenith-workspace.mjs` as oversized files, but those paths are no longer tracked in the current checkout. Current commit history shows recent splits/removals around the old targets.

Why it matters:
Internal plans are used to route work. Stale plans waste implementation time and can cause agents to audit or patch non-existent files.

Evidence:
- `docs/_internal/maintainability/oversized-file-refactor-plan.md:182-183` references the old site paths.
- `git ls-files | rg 'documentationSource|zenith-workspace|run-bundle-analysis|generate-ai-endpoints'` now returns only `apps/benchmarks/scripts/run-bundle-analysis.mjs` and `docs/scripts/generate-ai-endpoints.mjs`.
- `git log --oneline` shows recent relevant commits: split AI endpoint generator, split documentation source helpers, split bundle analysis helpers, split public asset sync helpers, and then reset site to a minimal template.

Recommended fix:
Update the internal maintainability plan after each completed slice. Add a tiny plan-audit script that flags referenced paths no longer present in `git ls-files`.

What not to do:
Do not use stale internal plans as implementation authority without checking the current tree.

Suggested issue title:
Refresh oversized-file maintainability plan after completed splits and site reset.

### Finding 12: Graphify evidence is useful inventory, not a dependency map yet

Area: Package architecture, Graphify
Severity: Low
Confidence: High
Files inspected: `graphify-out/graph.json`

What I found:
The existing root Graphify output has 7663 nodes, 14420 links, 58 hyperedges, and zero `edges`. The largest node clusters are `packages/cli`, `packages/bundler`, `packages/compiler`, `apps/benchmarks`, `packages/router`, `packages/create-zenith`, and `packages/runtime`.

Why it matters:
This is useful for scoping attention, but it is not enough to make dependency-direction claims. A root architecture roast should not pretend that links/hyperedges are the same as validated module dependencies.

Evidence:
- `graphify-out/graph.json` summary: nodes 7663, links 14420, edges 0, hyperedges 58.
- Top source clusters by node count included `packages/cli` 1606, `packages/bundler` 885, `packages/compiler` 738, `apps/benchmarks` 507, `packages/router` 422.

Recommended fix:
Keep using Graphify package-scoped first. Improve graph schema docs or generation so dependency edges are explicit and queryable before using it as a repo-wide architecture gate.

What not to do:
Do not run "full repo first" architecture conclusions from this graph shape.

Suggested issue title:
Clarify Graphify root graph schema and expose dependency edges before architecture gating.

## Icon Plugin / Icon Feature Recommendation

Recommendation: build an official icon feature, but do not use it to expand public plugin hooks.

Best first slice:

- Add a first-party `@zenithbuild/icons` package or `icons` config block owned by the CLI/build pipeline.
- Accept only local installed icon packages or explicit local SVG directories.
- Generate a deterministic, sanitized symbol sprite and manifest at build time.
- Provide a small `<Icon name="collection:name" />` component or compile-time helper.
- Keep dynamic icon names constrained to manifest entries; unknown names should fail at build/dev time where possible.
- Reject scripts, inline event attributes, remote fetches, `foreignObject`, and unsafe URL attributes in custom SVGs by default.
- Add tests for sprite determinism, tree-shaken icon selection, SSR/static output, basePath behavior, and SVG sanitizer failures. Avoid public compiler transforms, runtime wrappers that import full icon packs, remote icon fetching, and "just document Lucide" as the long-term answer.

## Security Notes

Confirmed strengths:

- No confirmed SSRF issue found in active image code. Remote image config defaults to no remote patterns and no local network fetches.
- No confirmed path traversal issue found in public asset copying; symlinks are skipped and output paths are bounded.
- No confirmed auth bypass found in guard/load inspection. The direct server response remains authoritative.
- Embedded markup and normal attribute rendering have meaningful script/event/URL safety gates.

True risks:

- `unsafeHTML` is a real XSS sink when fed untrusted content. It is explicit, not hidden.
- `zenith.config.*` and configured plugin hooks execute project code. That is expected, but it is trusted code, not sandboxed code.
- Hosted route-check parity gaps are product/DX risks and can cause navigation inconsistency; from inspected evidence they are not the security boundary.

Theoretical or non-findings:

- I did not find evidence that route-check skip on hosted targets bypasses server authorization.
- I did not find evidence that image redirects bypass remote allowlist/private-network checks; redirects are revalidated.
- `_legacy_v1` contains unsafe-looking historical patterns, but docs mark legacy snapshots as non-public internal context. Do not count those as current active runtime vulnerabilities without a shipping path.

## Missing Tests

- Hosted adapter tests for guarded soft navigation and route-check parity on Vercel/Netlify.
- Hosted adapter tests for `ctx.download()` behavior, including explicit 501 expectations until implemented.
- Clean-install smoke matrix for the declared package manager and supported Node/Bun versions.
- Native package install smoke for unsupported-platform error messages, especially linux arm64 if it remains unsupported.
- `unsafeHTML` strict-mode/docs tests that force an explicit trust-boundary example.
- `.zen` style-token lint tests for hardcoded colors and raw CSS variables, with SVG-safe exclusions.
- Icon feature tests: sanitizer rejection, deterministic sprite manifest, SSR/static output, basePath, unknown icon names.
- Internal plan freshness test for references to deleted/renamed files.
- Graphify schema tests that distinguish inventory links from dependency edges.
- First-run docs E2E test that follows the Getting Started page against a fresh scaffold.

## Suggested GitHub Issues

Critical:

- Pin Bun/package-manager release tooling and declare native platform support before the next public release train.

High:

- Add a real Getting Started quickstart and verify it with a clean scaffold.
- Close hosted adapter parity for advisory route-check and resource downloads.
- Add hosted adapter regression tests for guard/load/action behavior.

Medium:

- Clarify Plugin V1 as config-time trusted code and separate discovery from install.
- Design first-party icons as a build-time feature with sanitized local SVG inputs.
- Continue file-size reductions for compiler lexer/parser and near-limit CLI/runtime files.
- Document and lint the `unsafeHTML` trust boundary.
- Add Tailwind token enforcement for `.zen` source examples and site components.
- Refresh internal maintainability plans after completed file splits and removed paths.

Low:

- Improve Graphify graph schema docs and dependency edge output before repo-wide architecture claims.
- Make language/editor tooling status explicit while language packages remain private.

Opportunity:

- Turn the security controls into a short "Zenith security model" doc.
- Add a "known adapter differences" page generated from adapter tests.
- Create an examples gallery that uses only canonical Zenith primitives and doubles as integration coverage.

## Final CTO Pushback

Focus:

Get the first-run story, hosted parity, release reproducibility, and plugin/icon boundaries under control. These are the things that decide whether the framework feels serious to a new user, a deployment user, and a package consumer.

Do not build:

Do not build broad compiler plugins, runtime icon wrappers, CMS integrations, generic auth abstractions, or a design system until the current core is easier to adopt and deploy. The extension contract is one of Zenith's strengths because it is closed. Keep it closed until there is a trust model and test plan.

Drift:

Internal plans already drifted from the current tree. The site worktree also shows styling-token drift risk. If docs, examples, and site code stop obeying the same contract as the compiler/runtime, users will learn the wrong framework.

Strong:

The framework core is stronger than the onboarding implies. Compiler diagnostics, runtime cleanup, guarded routing, image security, and OIDC publishing are real assets. The next phase should make that strength visible and reliable instead of adding more surface area.
