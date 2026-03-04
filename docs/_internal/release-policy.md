# Release Policy

After a stable train publish succeeds, keep `latest` coherent. `train` can remain as the safety channel, but public installs should not mix train versions across `core`, `cli`, and the internal toolchain packages.

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
