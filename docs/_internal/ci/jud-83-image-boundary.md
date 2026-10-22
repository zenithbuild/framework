# JUD-83 image package boundary: implementation checkpoint

This is the first extraction checkpoint, not a completed package split.
The loader is implemented and tested before changing CLI/adapters together.
Production callers still use the existing image pipeline until the package,
config ownership and consumer qualification are ready.

## Loader contract

`loadImagePackage({ projectRoot, required })` is internal to the CLI.

- `required=false`: return null without package resolution, import or Sharp.
- `required=true`: resolve from the consumer's package tree, validate exact
  CLI/image release-train identity, then dynamically import the image API.
- Return `{ api, packageRoot, componentPath, sharpVersionRange }`.
- Missing package: fail with `npm i -D @zenithbuild/image@<exact CLI version>`.
- Broken installed package: preserve its original error; do not disguise
  dependency/import failures as absence of the optional image package.
- Image must export its package manifest and `components/Image.zen` as well
  as the existing artifact, request, materialization and payload functions.
  Adapters read the Sharp range from this manifest, never the CLI manifest.

The CLI remains responsible for detecting raster files in public/ and Image
usage across pages, components, layouts and globals before any compiler
spawn or output mutation. The loader deliberately accepts that decision;
it does not add a second markup parser or silently infer an incomplete tree.
Dev must repeat detection after relevant source/public file additions.
Preview and generated runtimes use output image metadata/endpoint needs.

## Verified dependency conflict

The supplied simplification handoff says config consolidation in core must
precede JUD-83. The Linear issue currently says there are no dependencies.
At f504c98, CLI config.js imports image normalization from images/shared.js;
core/config.ts separately implements image normalization. Core's manifest
already depends on CLI. Merely moving shared.js and importing image from
CLI config would make image/Sharp mandatory for every project. Making image
depend on CLI for base-path/config helpers introduces the wrong dependency
direction. Adding CLI -> core without addressing core -> CLI adds a cycle.

The concrete decision for Judah is the shared config/module home and the
core/CLI dependency direction. This checkpoint avoids changing either.
No new package name, Rust change, public API or risk acceptance is implied.

## Remaining extraction and acceptance work

1. Resolve the shared config/base-path boundary and record the decision.
2. Move images/* and Image.zen into @zenithbuild/image with Sharp ^0.35.5;
   add the exact lockstep train entry and image-template dependencies.
3. Wire early usage detection, lazy build/dev/preview/runtime loading and
   component registration; migrate adapters to the loader contract.
4. Move/update image tests and the Sharp floor; preserve security checks.
5. Qualify missing-package errors before work, no-image build/dev/preview,
   image output and relocated SSR, then full CI. Measure scratch npm 12,
   pnpm 10 and Bun installs with machine, method and run count.
6. Publish migration documentation with the final behavior. Until then,
   neither Sharp removal nor the prior install-size estimate is a result.

JUD-84 remains dependent on completion of this extraction. JUD-16 retains
the Sharp security and image-path qualification. This PR stays draft.
