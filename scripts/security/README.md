# Dependency security checks

## Withdrawn npm esbuild advisory

The hardcoded npm version gate for **GHSA-gv7w-rqvm-qjhr** was removed from
`scripts/ci-core.sh` after checking the advisory's current applicability.

[GitHub withdrew the advisory on June 17, 2026](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr)
because it identified the wrong package. The affected distribution is esbuild's
Deno module; the repository's Bun/npm lockfiles resolve the npm package.
Applying the withdrawn npm version range to these lockfiles does not establish
that the Deno vulnerability is present.

The removed scanner also skipped nested Bun entries such as `vite/esbuild`
because it tested the lockfile key instead of the resolved package identity.
For example, the Tina CLI 3 update resolves top-level `esbuild@0.28.2` and nested
`vite/esbuild@0.25.12`, although that scanner reported `vulnerable=0`. A green
result from that scanner was not proof that all copies were at least 0.28.1.

This correction does not exempt esbuild from other advisories or apply to a
future Deno integration. Evaluate advisories against their actual package,
distribution, and affected versions. Any future lockfile scanner must inspect
resolved package identities, including nested entries, and test that behavior.

Core CI still runs its build, shipped-surface verification, type checks, tests,
and contract checks with `set -euo pipefail`. Their failures remain blocking.
No dependency versions or lockfiles change as part of this gate correction.
