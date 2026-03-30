// ---------------------------------------------------------------------------
// index.js — Zenith Router V0 Public API
// ---------------------------------------------------------------------------
// Structural navigation exports + route protection policy/event hooks.
// ---------------------------------------------------------------------------

export { createRouter } from './router.js';
export { navigate, refreshCurrentRoute, back, forward, getCurrentPath } from './navigate.js';
export { onRouteChange, on, off, setRouteProtectionPolicy, _getRouteProtectionPolicy, _dispatchRouteEvent } from './events.js';
export { zenNavigationShell } from './navigation-shell.js';
export { matchRoute } from './match.js';
