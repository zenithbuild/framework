# Render-utils benchmark record (JUD-11)

Raw runs are in `render-utils-bench-results.json` next to this file. Both engines produced the same DOM fingerprint on every run:

`fingerprint::named::true::a<em>c</em>::<!--zx:bind:0--><strong>z</strong><!--/ zx:bind:0-->::||0|ok`

Baseline is `train` at `39c325b566ce167565940614e924263948c2be3c`. The candidate is this branch's runtime dist after moving `_coerceText` and `_createContextualFragment` into `render-utils.js`. The historical ~13.9% figure was not used as an input and was not reproduced here.

Machine for both engines: Linux 6.12.94+ x86_64, hostname `cursor`, 4 vCPU, `Intel(R) Xeon(R) Processor` (speed reported as 0; virtualized). Processes were pinned with `taskset -c 0`.

## happy-dom (synthetic)

- Harness: `bun --preload ./bun-test-setup.js ./scripts/render-utils-bench.js` from `packages/runtime`
- DOM: happy-dom 21.0.4. Runtime: Bun 1.4.0. Timer: `Bun.nanoseconds`
- Protocol: 1 discarded warmup process, then 5 processes. Each process discards 3 warmups and keeps 21 samples. The table is the median of those 5 per-run medians.
- Graphs: unbundled `dist/*.js`, and the production-emitted template written to a temp module (removed with `rmSync` after import; that cleanup is outside the timed section)
- `attrMarker` does not call the extracted helpers

| Case | Unbundled train ms | Unbundled after ms | Delta | Emitted train ms | Emitted after ms | Delta |
|---|---:|---:|---:|---:|---:|---:|
| textMarker | 16.833 | 16.323 | -3.03% | 23.261 | 23.086 | -0.75% |
| attrMarker | 24.247 | 24.030 | -0.90% | 27.901 | 27.529 | -1.33% |
| fragmentTextUpdate | 15.436 | 15.222 | -1.38% | 19.139 | 19.064 | -0.39% |
| fragmentHtmlUpdate | 16.571 | 16.077 | -2.98% | 16.937 | 16.792 | -0.86% |
| commentHtmlMarker | 14.779 | 14.560 | -1.48% | 15.091 | 14.777 | -2.08% |
| coerceTextDirect | 16.059 | 15.889 | -1.06% | 16.129 | 15.987 | -0.88% |
| contextualFragmentDirect | 15.928 | 15.101 | -5.19% | 15.206 | 15.092 | -0.75% |

Per-run spreads on the emitted graph were about 1.3–8.9%. These deltas sit inside that noise.

## Chrome (headless)

- Harness: `packages/runtime/scripts/render-utils-browser-bench.js`
- Browser: Google Chrome 156.0.8078.47, launched by Playwright (`apps/smoke-test`) with `channel: "chrome"`, `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
- Timer: `performance.now()` converted to nanoseconds. Chrome quantized samples to 0.1 ms.
- Protocol: 5 page loads per graph per dist. Each load discards 3 warmups and keeps 21 samples. The table is the median of the 5 page-load medians.
- The same iteration counts as the happy-dom harness. Absolute milliseconds are not comparable across engines.
- Baseline dist: detached worktree of `train` at the commit above. Candidate dist: `packages/runtime` on this branch.

```sh
RENDER_BROWSER_BASELINE=/path/to/train/packages/runtime/dist \
RENDER_BROWSER_CANDIDATE=/path/to/branch/packages/runtime/dist \
bun ./scripts/render-utils-browser-bench.js
```

If Playwright or Chrome is missing, the script exits 2 and does not write a result.

| Case | Unbundled train ms | Unbundled after ms | Delta | Emitted train ms | Emitted after ms | Delta |
|---|---:|---:|---:|---:|---:|---:|
| textMarker | 11.000 | 10.700 | -2.73% | 11.000 | 11.700 | +6.36% |
| attrMarker | 4.400 | 4.400 | 0.00% | 4.600 | 4.600 | 0.00% |
| fragmentTextUpdate | 13.500 | 13.600 | +0.74% | 13.300 | 13.700 | +3.01% |
| fragmentHtmlUpdate | 141.500 | 150.000 | +6.01% | 148.100 | 148.200 | +0.07% |
| commentHtmlMarker | 152.400 | 228.900 | +50.20% | 198.100 | 170.100 | -14.13% |
| coerceTextDirect | 8.600 | 8.600 | 0.00% | 8.600 | 8.700 | +1.16% |
| contextualFragmentDirect | 26.100 | 24.700 | -5.36% | 24.600 | 25.500 | +3.66% |

Direct `_coerceText` is flat (8.6 ms vs 8.6 ms unbundled). Text, attribute, and fragment-text updates stay within a few percent and inside the other variant's page-load spread. The emitted production template, which is what the bundler ships, does not show a stable slowdown.

`commentHtmlMarker` on the unbundled graph is the only median that moves by more than 13.9%. It is not a stable result. Train page-load medians for that case were 144.4, 152.1, 152.4, 194.6, and 392.4 ms. The candidate loads were 137.8, 215.8, 228.9, 289.2, and 323.0 ms. The ranges overlap, and the same case on the emitted template moves the other direction (train 132.5–262.9 ms, candidate 156.5–255.0 ms). Those samples are dominated by Chrome HTML parsing, not by the helper call.

`fragmentHtmlUpdate` on the unbundled graph is +6.01% (train 131.4–144.6 ms, candidate 145.1–154.0 ms). The emitted graph for that case is 148.1 ms vs 148.2 ms.

## What is still open

A second machine, or a browser trace of a real Zenith page, is still useful. Re-run the command above; do not copy these medians onto a different host. This record does not claim a speedup.
