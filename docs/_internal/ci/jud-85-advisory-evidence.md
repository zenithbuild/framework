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
also fail, with a separate exit code (see below). Core continues its build/tests to expose additional failures and
retains the failed audit status if those checks pass.

No active finding is accepted or suppressed. JUD-21 owns policy and dated
exceptions. Active TinaCMS findings and the separate active esbuild advisory
remain unresolved; this patch does not remove CMS dependencies, upgrade
unrelated packages, or alter site source.

Validation: four focused audit-parser regressions pass. Actual audits retain
exit 1 with the active findings. The full core lane and hosted results are
recorded in the implementation PR and Linear rather than inferred from this check.

The first full hosted core run after removing the obsolete assertion reached
the CLI tests: 119 suites passed and config-truth's image test failed in
libpng. The same focused test fails on baseline f504c98 with the same Sharp
0.35.5 install. Its embedded PNG has an invalid IDAT CRC (IHDR/IEND CRCs are
valid). Replace only the fixture bytes with a valid 1x1 RGBA PNG. Keep the
image transformation assertions, Sharp version floor and corrupt-input
checks unchanged. All 14 config-truth tests plus the Sharp floor pass after
this correction. No image runtime or site asset was changed.

## Exit codes

`scripts/security/check-dependency-advisories.mjs` exits with:

| Code | Meaning |
| --- | --- |
| 0 | Root and site audited cleanly (withdrawn-only findings count as clean). |
| 1 | The audit ran and reported active advisory findings. |
| 2 | The audit could not run in at least one scope: missing `bun`, registry or network failure, timeout, invalid JSON, unsupported schema, or an unexpected crash. Results are incomplete, so 2 wins over findings in another scope. |

Code 2 is an infrastructure or tooling fault, never a clean pass. Both
nonzero codes keep core red. `scripts/ci-core.sh` ends with a line naming
which of the two caused the red.
