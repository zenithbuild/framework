# @zenithbuild/image

Optional image processing for Zenith. Install the exact version matching the
framework train in projects that use `<Image>`, or to optimize raster files in
`public/` (without it they are copied unoptimized):

```sh
npm i -D @zenithbuild/image@0.8.0
```

CLI detects these inputs before compilation and output mutation, loads this
package from the consumer project, and registers the `<Image>` component.
For 0.9 the component file stays in `@zenithbuild/cli` (component IDs derive
from its path); image processing is owned here, and the Rust compiler's image
materialization contract stays in the compiler. Image configuration is
available through `@zenithbuild/core/config`.

The package requires Sharp `^0.35.5`. Node deployment output declares that range
and requires installing its generated runtime dependencies before starting it.
No-image applications need neither this package nor Sharp. Do not add this
package as an optional dependency of CLI: package managers install optional
dependencies by default.
