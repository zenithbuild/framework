# JUD-83 scratch install measurements

Source: `68eecf3ca8b316f0bc6e640ea1b6120347d52fe3` (clean working tree). Tarball integrity hashes, all 18 runs and exact machine details are in [the raw evidence](./jud-83-image-install-benchmark.json).

Machine: Debian on WSL2, Linux x64, Ryzen 5 3500U, Node 24.19.0. Three fresh consumer directories per manager per mode; local exact-train tarballs and overrides, normal optional dependencies and install scripts, warm global caches; pnpm uses a fresh store per run. Apparent file bytes follow symlinks and deduplicate physical paths. These are install-tree measurements, not compressed download sizes or a controlled cross-platform speed comparison.

| Manager | No images: bytes | Images: bytes | Difference | Sharp packages without images |
| --- | ---: | ---: | ---: | ---: |
| npm 12.2.0 | 31,489,971 | 51,863,671 | 20,373,700 | 0 / 3 runs |
| pnpm 10.34.7 | 31,498,978 | 51,884,273 | 20,385,295 | 0 / 3 runs |
| bun 1.4.0 | 31,485,867 | 71,091,327 | 39,605,460 | 0 / 3 runs |

All three repeated sizes in each group are identical. Image-enabled trees contain Sharp and its native packages; Bun installs more native optional variants than npm/pnpm on this host. No-image trees contain neither Sharp nor its native packages in any run.

This is implementation evidence. Friday's independent Benchmark Verifier sign-off is still required. No publication, release or merge was performed.
