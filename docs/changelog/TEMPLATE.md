# Release notes template

Copy this skeleton into `CHANGELOG.md` when a version is cut, and into `docs/changelog/vX.Y.Z.md` for a stable release. Delete the guidance comments before publishing. Do not invent provider results. This file is the template, not a release.

The Deployment verification subsection is required on every versioned release section (JUD-99, JUD-22 path 2). Day-to-day pull requests still add their own `## [Unreleased]` bullets. Fill this subsection at release cut, not on every pull request.

## [X.Y.Z] - YYYY-MM-DD

### Added

- 

### Changed

- 

### Fixed

- 

### Deployment verification

CI Pipeline Engineer fills the three buckets from the commit being released. Docs copies that evidence into this subsection. A missing job is written as `not run`. A host moves out of **Not live-verified** only when a recorded live provider smoke passes. This template does not accept a live-verified claim by itself.

- **Conformance-tested:** `<suite name, result, commit SHA — or "not run">`
- **Locally served:** `<credential-free node/static serve result — or "not run">`
- **Not live-verified:** `<providers with no recorded live smoke>`

#### How CI Pipeline Engineer fills the buckets (JUD-94)

JUD-94 names the hosted-adapter conformance suite and adds credential-free smoke. Until that job exists, use the pointer below and do not upgrade the labels.

1. **Conformance-tested.** Read the JUD-94 conformance job for this commit. Record the suite name, pass/fail, and commit SHA. Before that job is named, the in-repo evidence is `packages/cli` `test:deployment-smoke` plus the `adapter-hosted-*` specs: build-output shape for `static`, `static-export`, `vercel-static`, `netlify-static`, `vercel`, `netlify`, and `node`, and in-process imports of emitted Vercel/Netlify function modules and the Node artifact. Say that explicitly. Do not write "live-verified".
2. **Locally served.** Read the JUD-94 credential-free smoke: the `node` artifact started on the runner, and `static` / `static-export` output served on the runner, with the probe accepting `node` and `static`. Record pass/fail and the URL shape (`http://127.0.0.1`). If that job has not landed, write `not run`. In-process imports are not locally served.
3. **Not live-verified.** List every provider that did not pass a recorded live smoke. Vercel and Netlify stay here while JUD-22 path 1 is deferred. Cloudflare is not a built-in target; do not add a Cloudflare parity claim. A Node PaaS is not live-verified unless a run was actually recorded.

Live Vercel/Netlify provider smoke is out of scope for this template. Do not paste provider URLs, tokens, or a passing live result that CI did not record.

## Dry run (do not paste into a release unchanged)

This example matches the evidence available on 2026-10-24, before JUD-94 names the suite. Replace it with the release commit's CI result.

### Deployment verification

- **Conformance-tested:** CI-built output for `static`, `static-export`, `vercel-static`, `netlify-static`, `vercel`, `netlify`, and `node`. Vercel and Netlify function modules and the Node artifact are imported in-process (`test:deployment-smoke`, `adapter-hosted-*`). JUD-94 has not yet named this suite. No commit SHA is attached because this is a template dry run, not a release.
- **Locally served:** not run. Credential-free node and static serve is JUD-94 and is not in CI yet.
- **Not live-verified:** Vercel, Netlify, and every Node host. No live provider smoke is recorded. Cloudflare is not a built-in target.
