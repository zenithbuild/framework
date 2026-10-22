# JUD-15 cache qualification

Pinning the CI toolchain and fixing CLI entrypoints exposed a cached-only
consumer failure: the public core bin could not resolve bundler. Fresh
hosted Node/Bun consumers and public-bin scripts passed. Restoring the Bun
cache alone also passed.

Controlled hosted reproduction:
https://github.com/zenithbuild/framework/actions/runs/39716885881/job/119621020489

Adding the existing Cargo cache restore (`packages/**/target`) reproduces
the failure with the same source and JS build. That glob follows workspace
dependency links. The archive restores physical directories at
`packages/core/node_modules/@zenithbuild/bundler` and the corresponding CLI
dependency path, containing only `target/`. Bun's frozen install leaves
these directories in place. Resolving the workspace wrapper from core then
fails with MODULE_NOT_FOUND; the diagnostic also reproduces the public-bin
and Bun-script failure. This is cache corruption, not a mixed-train waiver.

The three CI lanes now cache only `packages/compiler/target` and
`packages/bundler/target`, plus Cargo's registry/git caches. Their namespace
includes Rust 1.97.1 and schema v2, with no fallback to the contaminated
legacy archive. No existing cache is deleted. A regression checks all three
lanes' explicit paths and namespace. Hosted full-CI and warm-cache results
are recorded separately in the PR/Linear.
