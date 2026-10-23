# JUD-83 optional images and shared configuration

This describes the implementation in PR #235, pending integration and review.

Install `@zenithbuild/image` at the exact version of CLI/core when a project
uses `<Image>` in its source directory. Install it to optimize JPG/JPEG/PNG/WebP/AVIF
files in `public/`; without it they are copied unoptimized:

```sh
npm i -D @zenithbuild/image@0.8.0
```

The CLI checks `.zen` files in the source directory (the parent of the pages
directory, as build uses) and public assets before compilation or output
deletion. Missing and skewed packages give the exact installation command for
the project's package manager (lockfile first, then the invoking package
manager). The component is registered from the consumer's installed package;
local components cannot shadow it. SVG and ordinary `<img>` alone do not
require the processing package. Static raster files alone, such as a favicon or
social image, do not require it either: when it is installed they still receive
variants, matching the previous CLI behavior; when it is absent they are copied
verbatim and the CLI prints an install hint. Built image output carries a small
package marker, so preview retains image endpoints when original page sources
are absent. No-image builds omit it, and preview never rescans sources.

The image package owns Sharp `^0.35.5` and the JS/TS processing pipeline.
`Image.zen` stays at `packages/cli/src/framework-components/Image.zen` for
0.9 because component IDs derive from the component path; path-independent
IDs are follow-up work. The Rust compiler/bundler materialization remains unchanged. CLI has
no hard or optional dependency on the image package or Sharp. Its development
dependency supplies workspace integration fixtures and is omitted from packed
consumer runtime installs.

`@zenithbuild/core` owns the shared schema, defaults, image configuration,
plugin configuration hooks, base-path helpers and Node config loader in
`packages/core/src/config/`, exported as `@zenithbuild/core/config`,
`/config/node`, `/config/plugins`, `/config/base-path` and `/config/images`.
Core's source imports no other Zenith package (guardrail-enforced). CLI and
the image package declare core as a peer dependency, so no runtime
dependency cycle is added; core keeps its existing CLI dependency for the
`zenith` command. Core's existing imports continue to work. CLI retains its non-enumerable explicit-key/loading metadata
and pages-directory discovery. No core-to-CLI dependency was reversed.
Shared plugin errors retain CLI's readable message for thrown plain objects;
core now uses that same message instead of coercing such objects to text.

Generated Node output declares Sharp only for image-enabled builds. Install
dependencies inside that output before starting a relocated artifact. Adapter
packaging reads the image package's declared Sharp range, and copies its
runtime with standalone shared configuration helpers. Hosted functions retain
their existing local Sharp fallback behavior, resolving from the consumer's
image package; JUD-16 owns further Sharp/path qualification.

The file formerly named `images/router-manifest.js` actually writes server
guard/load/action metadata. It stays in CLI as `router-server-metadata.js`,
and executes on no-image builds too.

The basic, CSS and Tailwind scaffolder templates currently contain no raster
assets or Image tags, so they do not gain an unused dependency. A mechanical
template check requires an exact train image dependency if this changes.

Both new packages participate in the release matrix and packed consumers.
No package was published. Registry naming availability and actual publication
permissions are separate checks at release time.

Install measurements and final verification evidence are recorded separately.
Local implementation evidence does not replace Friday's independent reviews
or Benchmark Verifier sign-off. The active advisory gate remains enforced.
