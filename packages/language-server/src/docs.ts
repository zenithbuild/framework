export interface SymbolDoc {
  readonly label: string;
  readonly summary: string;
  readonly example: string;
  readonly docPath: string;
}

const DOCS_BASE_URL = 'https://github.com/zenithbuild/framework/blob/master/';

function createEventDoc(label: string, summary: string, example: string): SymbolDoc {
  return {
    label,
    summary,
    example,
    docPath: 'docs/documentation/syntax/events.md'
  };
}

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
  },
  'on:esc': {
    ...createEventDoc(
      'on:esc',
      'Escape-filtered keydown alias that routes through Zenith’s document-level esc dispatch.',
      '<button on:esc={closeMenu}>Close</button>'
    )
  },
  'on:hoverin': {
    ...createEventDoc(
      'on:hoverin',
      'Hover sugar alias for pointerenter when hover logic needs real event wiring.',
      '<div on:hoverin={handleEnter}></div>'
    )
  },
  'on:hoverout': {
    ...createEventDoc(
      'on:hoverout',
      'Hover sugar alias for pointerleave when hover logic needs real event wiring.',
      '<div on:hoverout={handleLeave}></div>'
    )
  },
  'on:click': createEventDoc(
    'on:click',
    'Canonical mouse click binding in Zenith’s universal on:* event model.',
    '<button on:click={handleClick}>Press</button>'
  ),
  'on:doubleclick': createEventDoc(
    'on:doubleclick',
    'Canonical alias that normalizes doubleclick bindings to the emitted dblclick event.',
    '<button on:doubleclick={handleDoubleClick}>Press</button>'
  ),
  'on:dblclick': createEventDoc(
    'on:dblclick',
    'Canonical double-click binding using the normalized dblclick event name.',
    '<button on:dblclick={handleDoubleClick}>Press</button>'
  ),
  'on:keydown': createEventDoc(
    'on:keydown',
    'Canonical keyboard keydown binding in Zenith’s universal on:* event model.',
    '<div on:keydown={handleKeydown}></div>'
  ),
  'on:keyup': createEventDoc(
    'on:keyup',
    'Canonical keyboard keyup binding in Zenith’s universal on:* event model.',
    '<div on:keyup={handleKeyup}></div>'
  ),
  'on:submit': createEventDoc(
    'on:submit',
    'Canonical form submit binding in Zenith’s universal on:* event model.',
    '<form on:submit={handleSubmit}></form>'
  ),
  'on:input': createEventDoc(
    'on:input',
    'Canonical input binding for immediate form-value updates.',
    '<input on:input={handleInput} />'
  ),
  'on:change': createEventDoc(
    'on:change',
    'Canonical change binding for committed form-value updates.',
    '<input on:change={handleChange} />'
  ),
  'on:focus': createEventDoc(
    'on:focus',
    'Canonical focus binding for element focus transitions.',
    '<input on:focus={handleFocus} />'
  ),
  'on:blur': createEventDoc(
    'on:blur',
    'Canonical blur binding for element focus exit transitions.',
    '<input on:blur={handleBlur} />'
  ),
  'on:pointerdown': createEventDoc(
    'on:pointerdown',
    'Canonical pointerdown binding from the recommended pointer event set.',
    '<div on:pointerdown={handlePointerDown}></div>'
  ),
  'on:pointerup': createEventDoc(
    'on:pointerup',
    'Canonical pointerup binding from the recommended pointer event set.',
    '<div on:pointerup={handlePointerUp}></div>'
  ),
  'on:pointermove': createEventDoc(
    'on:pointermove',
    'Canonical pointermove binding from the recommended pointer event set.',
    '<svg on:pointermove={handlePointerMove}></svg>'
  ),
  'on:pointerenter': createEventDoc(
    'on:pointerenter',
    'Direct pointerenter binding remains fully supported alongside on:hoverin.',
    '<div on:pointerenter={handleEnter}></div>'
  ),
  'on:pointerleave': createEventDoc(
    'on:pointerleave',
    'Direct pointerleave binding remains fully supported alongside on:hoverout.',
    '<div on:pointerleave={handleLeave}></div>'
  ),
  'on:dragstart': createEventDoc(
    'on:dragstart',
    'Canonical dragstart binding from Zenith’s recommended drag event set.',
    '<div draggable="true" on:dragstart={handleDragStart}></div>'
  ),
  'on:dragover': createEventDoc(
    'on:dragover',
    'Canonical dragover binding from Zenith’s recommended drag event set.',
    '<div on:dragover={handleDragOver}></div>'
  ),
  'on:drop': createEventDoc(
    'on:drop',
    'Canonical drop binding from Zenith’s recommended drag event set.',
    '<div on:drop={handleDrop}></div>'
  ),
  'on:scroll': createEventDoc(
    'on:scroll',
    'Canonical scroll binding from Zenith’s recommended event set.',
    '<div on:scroll={handleScroll}></div>'
  ),
  'on:contextmenu': createEventDoc(
    'on:contextmenu',
    'Canonical contextmenu binding from Zenith’s recommended mouse event set.',
    '<div on:contextmenu={handleContextMenu}></div>'
  )
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
  'on:doubleclick',
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
