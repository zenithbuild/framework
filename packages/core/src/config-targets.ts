export const ZENITH_TARGETS = [
  'static',
  'static-export',
  'vercel-static',
  'netlify-static',
  'vercel',
  'netlify',
  'node'
] as const;

export type ZenithTarget = typeof ZENITH_TARGETS[number];
