/**
 * Deterministic route precedence:
 *   static segment > param segment > catch-all segment.
 * Tie-breakers: segment count (more specific first), then lexicographic path.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareRouteSpecificity(a, b) {
  if (a === '/' && b !== '/') return -1;
  if (b === '/' && a !== '/') return 1;

  const aSegs = splitPath(a);
  const bSegs = splitPath(b);
  const aClass = routeClass(aSegs);
  const bClass = routeClass(bSegs);
  if (aClass !== bClass) {
    return bClass - aClass;
  }

  const max = Math.min(aSegs.length, bSegs.length);
  for (let i = 0; i < max; i++) {
    const aWeight = segmentWeight(aSegs[i]);
    const bWeight = segmentWeight(bSegs[i]);
    if (aWeight !== bWeight) {
      return bWeight - aWeight;
    }
  }

  if (aSegs.length !== bSegs.length) {
    return bSegs.length - aSegs.length;
  }

  return a.localeCompare(b);
}

/**
 * @param {string} pathname
 * @param {Array<{ path: string }>} routes
 * @returns {{ entry: { path: string }, params: Record<string, string> } | null}
 */
export function matchRoute(pathname, routes) {
  const target = splitPath(pathname);
  const ordered = [...routes].sort((a, b) => compareRouteSpecificity(a.path, b.path));
  for (const entry of ordered) {
    const pattern = splitPath(entry.path);
    const params = Object.create(null);
    let patternIndex = 0;
    let valueIndex = 0;
    let matched = true;

    while (patternIndex < pattern.length) {
      const segment = pattern[patternIndex];
      if (segment.startsWith('*')) {
        const optionalCatchAll = segment.endsWith('?');
        const key = optionalCatchAll ? segment.slice(1, -1) : segment.slice(1);
        if (patternIndex !== pattern.length - 1) {
          matched = false;
          break;
        }
        const rest = target.slice(valueIndex);
        const rootRequiredCatchAll = !optionalCatchAll && pattern.length === 1;
        if (rest.length === 0 && !optionalCatchAll && !rootRequiredCatchAll) {
          matched = false;
          break;
        }
        params[key] = normalizeCatchAll(rest);
        valueIndex = target.length;
        patternIndex = pattern.length;
        break;
      }

      if (valueIndex >= target.length) {
        matched = false;
        break;
      }

      const value = target[valueIndex];
      if (segment.startsWith(':')) {
        params[segment.slice(1)] = value;
      } else if (segment !== value) {
        matched = false;
        break;
      }

      patternIndex += 1;
      valueIndex += 1;
    }

    if (!matched) {
      continue;
    }

    if (valueIndex !== target.length || patternIndex !== pattern.length) {
      continue;
    }

    return { entry, params: { ...params } };
  }

  return null;
}

/**
 * Resolve an incoming request URL against a manifest route list.
 *
 * @param {string | URL} reqUrl
 * @param {Array<{ path: string }>} manifest
 * @returns {{ matched: boolean, route: { path: string } | null, params: Record<string, string> }}
 */
export function resolveRequestRoute(reqUrl, manifest) {
  const url = reqUrl instanceof URL ? reqUrl : new URL(String(reqUrl), 'http://localhost');
  const matched = matchRoute(url.pathname, manifest);
  if (!matched) {
    return { matched: false, route: null, params: {} };
  }
  return {
    matched: true,
    route: matched.entry,
    params: matched.params
  };
}

/**
 * @param {string[]} segments
 * @returns {number}
 */
function routeClass(segments) {
  let hasParam = false;
  let hasCatchAll = false;
  for (const segment of segments) {
    if (segment.startsWith('*')) {
      hasCatchAll = true;
    } else if (segment.startsWith(':')) {
      hasParam = true;
    }
  }
  if (!hasParam && !hasCatchAll) return 3;
  if (hasCatchAll) return 1;
  return 2;
}

/**
 * @param {string | undefined} segment
 * @returns {number}
 */
function segmentWeight(segment) {
  if (!segment) return 0;
  if (segment.startsWith('*')) return 1;
  if (segment.startsWith(':')) return 2;
  return 3;
}

/**
 * @param {string} pathname
 * @returns {string[]}
 */
function splitPath(pathname) {
  return pathname.split('/').filter(Boolean);
}

/**
 * @param {string[]} segments
 * @returns {string}
 */
function normalizeCatchAll(segments) {
  return segments.filter(Boolean).join('/');
}
