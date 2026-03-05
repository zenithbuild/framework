# Release Policy

After a stable train publish succeeds, keep `latest` coherent. `train` can remain as the safety channel, but public installs should not mix train versions across `core`, `cli`, and the internal toolchain packages.

## Pipeline policy

- Normal publish is OIDC-only via `.github/workflows/publish.yml` in the `npm-release` environment.
- The standard path does not use token-based npm auth (`NPM_TOKEN` / `NODE_AUTH_TOKEN`).
- `.github/workflows/bootstrap-platform-packages.yml` is manual-only (`workflow_dispatch`) and reserved for bootstrapping brand-new package names.
- Train publish runs a bootstrap preflight; missing platform package names fail early with instructions to run the manual bootstrap workflow.
- The CI gate retries once (`bun run ci`), then publish proceeds only if the retry succeeds.
- Release creation is downstream of successful publish; if publish fails, release does not run.

## Minimum promotion

Run:

```sh
npm dist-tag add @zenithbuild/core@0.6.11 latest
npm dist-tag add @zenithbuild/cli@0.6.11 latest
```

## Recommended full alignment

Run:

```sh
npm dist-tag add @zenithbuild/core@0.6.11 latest
npm dist-tag add @zenithbuild/cli@0.6.11 latest
npm dist-tag add @zenithbuild/runtime@0.6.11 latest
npm dist-tag add @zenithbuild/router@0.6.11 latest
npm dist-tag add @zenithbuild/bundler@0.6.11 latest
npm dist-tag add @zenithbuild/compiler@0.6.11 latest
```

Promoting the full train avoids mixed installs where `@latest` still resolves an older compiler or bundler than the `core`/`cli` pair.
