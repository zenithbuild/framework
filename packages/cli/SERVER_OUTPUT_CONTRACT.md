# Server Output Contract

`.zenith-output/server` is the canonical packaged server layer for Zenith server-capable targets.

This is an internal contract, but it is now treated as stable enough to test directly. Adapters must consume this output. They must not reclassify routes or infer new runtime semantics.

## Layout

```text
.zenith-output/server/
├── manifest.json
├── base-path.js
├── server-contract.js
├── runtime/
│   └── route-render.js
├── images/
│   ├── materialize.js
│   ├── payload.js
│   └── shared.js
└── routes/
    └── <route-name>/
        ├── route.json
        ├── route/
        │   ├── entry.js
        │   ├── page.html
        │   └── <page-asset>.js
        └── modules/
            └── ...
```

## Inclusion Rule

Only routes already classified upstream as:

- `render_mode: "server"`
- backed by a server script
- `prerender !== true`

are emitted into `.zenith-output/server`.

Classification remains upstream:

- `manifest` classifies routes
- `server-output` packages classified routes
- adapters map packaged output into host-specific layouts

## `manifest.json`

The server manifest has the shape:

```json
{
  "base_path": "/docs",
  "routes": [
    {
      "name": "secure",
      "path": "/secure",
      "output": "/secure/index.html",
      "page_asset": "assets/secure.[hash].js",
      "page_asset_file": "secure.[hash].js",
      "route_id": null,
      "server_script_path": "<absolute project path>",
      "guard_module_ref": null,
      "load_module_ref": "pages/secure/page.load.ts",
      "has_guard": true,
      "has_load": true,
      "params": [],
      "base_path": "/docs",
      "image_manifest_file": null,
      "image_config": { "...": "normalized image config" }
    }
  ]
}
```

`route.json` inside each packaged route mirrors the same per-route metadata.

## Runtime Contract

`runtime/route-render.js` defines the packaged execution contract:

- `redirect(...)` returns an empty response body with `Location` and a 3xx status.
- `deny(...)` returns a plain-text response with the chosen status.
- `guard` and `load` run through `server-contract.js`.
- `data(...)` or implicit empty data injects `window.__zenith_ssr_data` into the HTML shell.
- `base_path` is used to reconstruct public request URLs and app-local redirects.
- thrown execution errors return a `500` plain-text response instead of escaping raw exceptions through the host adapter. The message currently preserves the thrown error string.

## Current Limits

- Server output now carries `base_path`, but there is still no separate `assetPrefix` knob. Public assets and framework endpoints intentionally follow the configured base path.
- The server package includes image helpers and route metadata, but platform-specific image endpoint support still depends on the adapter. `node` wires `/_zenith/image`; `vercel` and `netlify` still do not.
