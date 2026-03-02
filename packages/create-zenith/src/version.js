// ---------------------------------------------------------------------------
// version.js — Zenith Version Authority (V0)
// ---------------------------------------------------------------------------
// This is the SINGLE SOURCE OF TRUTH for versions used in generated projects.
// create-zenith must NEVER read from its own node_modules to find these.
// ---------------------------------------------------------------------------

export const VERSIONS = {
    // Zenith Packages (Pinned V0)
    zenith: "0.6.5",
    "@zenithbuild/core": "0.6.5",
    "@zenithbuild/cli": "0.6.5",
    "@zenithbuild/router": "0.6.5",
    "@zenithbuild/runtime": "0.6.5",

    // Peer Dependencies / Tools
    "typescript": "5.7.3",
    "@types/node": "20.0.0"
};

export const ENGINES = {
    node: ">=18.0.0"
};
