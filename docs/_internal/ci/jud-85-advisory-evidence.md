# JUD-85: withdrawn assertion and remaining dependency findings

Baseline: `f504c98d05579ce39069d11fb5d0825161add867`.
Captured on 2026-10-21 America/Chicago using Bun 1.4.0.

The old assertion fails on the site's esbuild 0.24.2 lock entry, but
[GHSA-gv7w-rqvm-qjhr](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr)
was withdrawn on 2026-06-17 because the affected package was incorrectly identified.
That advisory cannot substantiate the old npm esbuild version floor.

Fresh commands: `bun audit --json` at repository root and in `site/`.
Both returned exit 1. The accompanying JSON records 2 root and 35 site
package/advisory findings; overlapping packages across scopes are not deduplicated.
These are audit findings, not verified exploitability assessments.

The replacement check excludes only that verified withdrawn identifier.
All other severities and packages remain visible and produce a failed audit
status. Missing tools, registry failures, invalid JSON and unsupported schemas
also fail. Core continues its build/tests to expose additional failures and
retains the failed audit status if those checks pass.

No active finding is accepted or suppressed. JUD-21 owns policy and dated
exceptions. Active TinaCMS findings and the separate active esbuild advisory
remain unresolved; this patch does not remove CMS dependencies, upgrade
unrelated packages, or alter site source.

Validation: four focused audit-parser regressions pass. Actual audits retain
exit 1 with the active findings. The full core lane and hosted results are
recorded in the implementation PR and Linear rather than inferred from this check.
