# Zenith Benchmark Harness

Internal benchmark harness for Zenith fixture apps.

Current slice:

- Zenith + competitor fixtures
- Cold build runner
- Dev startup runner
- Browser runtime capture runner
- Zenith rebuild runner
- Matrix orchestration and schema validation
- Report rendering from validated result JSON
- Reproducibility and result-shape config

This workspace is methodology-first. It writes raw benchmark artifacts under `results/` and does not publish public benchmark claims.

## Commands

```bash
npm run run:cold-build
npm run run:dev-startup
npm run run:hydration
npm run run:matrix
npm run render:report -- --input ./results/<run-id>/matrix.json
```

Optional filters:

```bash
npm run run:cold-build -- --case static-marketing
npm run run:dev-startup -- --framework astro
npm run run:matrix -- --framework next-app-router
```
