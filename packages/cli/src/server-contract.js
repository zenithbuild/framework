// server-contract.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Shared validation and payload resolution logic for <script server> blocks.
//
// This file is intentionally a thin composition/export surface.
// ---------------------------------------------------------------------------

import { withMiddleware } from './server-middleware.js';

export {
    allow,
    redirect,
    deny,
    data,
    invalid,
    json,
    text,
    download,
    stream,
    sse
} from './server-contract/result-helpers.js';
export { validateServerExports } from './server-contract/export-validation.js';
export { assertJsonSerializable } from './server-contract/json-serializable.js';
export { resolveRouteResult, resolveServerPayload } from './server-contract/resolve.js';
export { withMiddleware };
