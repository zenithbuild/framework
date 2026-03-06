export interface SymbolDoc {
  readonly label: string;
  readonly summary: string;
  readonly example: string;
  readonly docPath: string;
}

const DOCS_BASE_URL = 'https://github.com/zenithbuild/framework/blob/master/';

const SYMBOL_DOCS: Record<string, SymbolDoc> = {
  zenEffect: {
    label: 'zenEffect',
    summary: 'Reactive side effect that re-runs when its dependencies change.',
    example: 'zenEffect(() => {\n  count.get()\n})',
    docPath: 'docs/documentation/reactivity/effects-vs-mount.md'
  },
  zenMount: {
    label: 'zenMount',
    summary: 'Mount-time lifecycle boundary for DOM effects and cleanup registration.',
    example: 'zenMount((ctx) => {\n  ctx.cleanup(offResize)\n})',
    docPath: 'docs/documentation/reactivity/effects-vs-mount.md'
  },
  state: {
    label: 'state',
    summary: 'Reactive binding for values that directly drive DOM expressions.',
    example: 'state open = false\nfunction toggle() { open = !open }',
    docPath: 'docs/documentation/reactivity/reactivity-model.md'
  },
  signal: {
    label: 'signal',
    summary: 'Stable reactive container with explicit get() and set() operations.',
    example: 'const count = signal(0)\ncount.set(count.get() + 1)',
    docPath: 'docs/documentation/reactivity/reactivity-model.md'
  },
  ref: {
    label: 'ref',
    summary: 'Typed DOM handle for measurements, focus, animation, and mount-time access.',
    example: 'const shell = ref<HTMLDivElement>()',
    docPath: 'docs/documentation/reactivity/reactivity-model.md'
  },
  zenWindow: {
    label: 'zenWindow',
    summary: 'SSR-safe window accessor that returns null when the browser environment is absent.',
    example: 'const win = zenWindow()\nif (!win) return',
    docPath: 'docs/documentation/reactivity/dom-and-environment.md'
  },
  zenDocument: {
    label: 'zenDocument',
    summary: 'SSR-safe document accessor for global DOM wiring inside mount-time logic.',
    example: 'const doc = zenDocument()\nif (!doc) return',
    docPath: 'docs/documentation/reactivity/dom-and-environment.md'
  },
  zenOn: {
    label: 'zenOn',
    summary: 'Canonical event subscription primitive that returns a disposer.',
    example: "const off = zenOn(doc, 'keydown', handleKey)\nctx.cleanup(off)",
    docPath: 'docs/documentation/reactivity/dom-and-environment.md'
  },
  zenResize: {
    label: 'zenResize',
    summary: 'Canonical window resize primitive for reactive viewport updates.',
    example: 'const off = zenResize(({ w, h }) => viewport.set({ w, h }))',
    docPath: 'docs/documentation/reactivity/dom-and-environment.md'
  },
  collectRefs: {
    label: 'collectRefs',
    summary: 'Deterministic multi-node collection helper that replaces selector scans.',
    example: 'const nodes = collectRefs(linkRefA, linkRefB, linkRefC)',
    docPath: 'docs/documentation/reactivity/dom-and-environment.md'
  }
};

export const canonicalScriptSymbols = [
  'zenMount',
  'zenEffect',
  'state',
  'signal',
  'ref',
  'zenWindow',
  'zenDocument',
  'zenOn',
  'zenResize',
  'collectRefs'
] as const;

export const canonicalEventAttributes = [
  'on:click',
  'on:dblclick',
  'on:keydown',
  'on:keyup',
  'on:esc',
  'on:submit',
  'on:input',
  'on:change',
  'on:focus',
  'on:blur',
  'on:pointerdown',
  'on:pointerup',
  'on:pointermove',
  'on:pointerenter',
  'on:pointerleave',
  'on:hoverin',
  'on:hoverout',
  'on:dragstart',
  'on:dragover',
  'on:drop',
  'on:scroll',
  'on:contextmenu'
] as const;

export function getSymbolDoc(symbol: string): SymbolDoc | undefined {
  return SYMBOL_DOCS[symbol];
}

export function getDocUrl(docPath: string): string {
  return `${DOCS_BASE_URL}${docPath}`;
}
