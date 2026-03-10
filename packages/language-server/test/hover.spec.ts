import { describe, expect, test } from 'bun:test';
import { getHover } from '../src/hover.js';

function hoverValue(hover: ReturnType<typeof getHover>): string {
  const contents = hover?.contents;
  if (!contents || typeof contents !== 'object' || !('value' in contents)) {
    return '';
  }
  return typeof contents.value === 'string' ? contents.value : '';
}

function hoverAtToken(text: string, token: string): string {
  const character = text.indexOf(token) + Math.min(3, token.length - 1);
  return hoverValue(getHover(text, { line: 0, character }));
}

describe('hover', () => {
  test('includes docs links and definitions for zenEffect', () => {
    const text = `zenEffect(() => {})`;
    const hover = getHover(text, { line: 0, character: 3 });
    const value = hoverValue(hover);

    expect(value).toContain('Reactive side effect');
    expect(value).toContain('docs/documentation/reactivity/effects-vs-mount.md');
  });

  test('includes reactivity docs for state', () => {
    const text = `state open = false`;
    const hover = getHover(text, { line: 0, character: 2 });
    const value = hoverValue(hover);

    expect(value).toContain('drive DOM expressions');
    expect(value).toContain('docs/documentation/reactivity/reactivity-model.md');
  });

  test('includes canonical DOM and environment docs for Zenith primitives', () => {
    const text = `<script lang="ts">
const off = zenOn(zenDocument(), 'keydown', handleKey)
const resizeOff = zenResize(({ w, h }) => viewport.set({ w, h }))
const win = zenWindow()
const doc = zenDocument()
</script>`;

    const zenOnHover = getHover(text, { line: 1, character: 13 });
    const zenResizeHover = getHover(text, { line: 2, character: 18 });
    const zenWindowHover = getHover(text, { line: 3, character: 13 });
    const zenDocumentHover = getHover(text, { line: 4, character: 14 });

    expect(hoverValue(zenOnHover)).toContain('Canonical event subscription primitive');
    expect(hoverValue(zenOnHover)).toContain('docs/documentation/reactivity/dom-and-environment.md');

    expect(hoverValue(zenResizeHover)).toContain('Canonical window resize primitive');
    expect(hoverValue(zenResizeHover)).toContain('docs/documentation/reactivity/dom-and-environment.md');

    expect(hoverValue(zenWindowHover)).toContain('SSR-safe window accessor');
    expect(hoverValue(zenWindowHover)).toContain('docs/documentation/reactivity/dom-and-environment.md');

    expect(hoverValue(zenDocumentHover)).toContain('SSR-safe document accessor');
    expect(hoverValue(zenDocumentHover)).toContain('docs/documentation/reactivity/dom-and-environment.md');
  });

  test('includes canonical event alias docs for esc and hover sugar', () => {
    const text = `<button on:esc={closeMenu} on:hoverin={handleEnter} on:hoverout={handleLeave}></button>`;

    const escHover = getHover(text, { line: 0, character: 12 });
    const hoverInHover = getHover(text, { line: 0, character: 33 });
    const hoverOutHover = getHover(text, { line: 0, character: 58 });

    expect(hoverValue(escHover)).toContain('Escape-filtered keydown alias');
    expect(hoverValue(escHover)).toContain('docs/documentation/syntax/events.md');

    expect(hoverValue(hoverInHover)).toContain('pointerenter');
    expect(hoverValue(hoverInHover)).toContain('docs/documentation/syntax/events.md');

    expect(hoverValue(hoverOutHover)).toContain('pointerleave');
    expect(hoverValue(hoverOutHover)).toContain('docs/documentation/syntax/events.md');
  });

  test('includes canonical docs for the documented on:* event set', () => {
    const cases = [
      { token: 'on:click', fragment: 'mouse click binding' },
      { token: 'on:doubleclick', fragment: 'normalizes doubleclick bindings' },
      { token: 'on:dblclick', fragment: 'double-click binding' },
      { token: 'on:keydown', fragment: 'keyboard keydown binding' },
      { token: 'on:keyup', fragment: 'keyboard keyup binding' },
      { token: 'on:submit', fragment: 'form submit binding' },
      { token: 'on:input', fragment: 'immediate form-value updates' },
      { token: 'on:change', fragment: 'committed form-value updates' },
      { token: 'on:focus', fragment: 'focus transitions' },
      { token: 'on:blur', fragment: 'focus exit transitions' },
      { token: 'on:pointerdown', fragment: 'recommended pointer event set' },
      { token: 'on:pointerup', fragment: 'recommended pointer event set' },
      { token: 'on:pointermove', fragment: 'recommended pointer event set' },
      { token: 'on:pointerenter', fragment: 'alongside on:hoverin' },
      { token: 'on:pointerleave', fragment: 'alongside on:hoverout' },
      { token: 'on:dragstart', fragment: 'recommended drag event set' },
      { token: 'on:dragover', fragment: 'recommended drag event set' },
      { token: 'on:drop', fragment: 'recommended drag event set' },
      { token: 'on:scroll', fragment: 'recommended event set' },
      { token: 'on:contextmenu', fragment: 'recommended mouse event set' }
    ] as const;

    for (const { token, fragment } of cases) {
      const value = hoverAtToken(`<button ${token}={handler}></button>`, token);
      expect(value).toContain(fragment);
      expect(value).toContain('docs/documentation/syntax/events.md');
    }
  });
});
