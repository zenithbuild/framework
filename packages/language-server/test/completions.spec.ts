import { describe, expect, test } from 'bun:test';
import { getCompletionItems } from '../src/completions.js';

describe('completions', () => {
  test('returns canonical Zenith primitives in script contexts', () => {
    const text = `<script lang="ts">\nzen\n</script>`;
    const items = getCompletionItems(text, { line: 1, character: 3 });
    const labels = items.map((item) => item.label);

    expect(labels).toContain('zenMount');
    expect(labels).toContain('zenEffect');
    expect(labels).toContain('state');
    expect(labels).toContain('zenOn');
    expect(labels).toContain('zenResize');
    expect(labels).toContain('zenWindow');
    expect(labels).toContain('zenDocument');
    expect(labels).not.toContain('react');
    expect(labels).not.toContain('vue');
    expect(labels).not.toContain('svelte');
  });

  test('returns canonical on:* suggestions in attribute contexts', () => {
    const text = `<button on></button>`;
    const items = getCompletionItems(text, { line: 0, character: 10 });
    const labels = items.map((item) => item.label);

    expect(labels).toContain('on:click');
    expect(labels).toContain('on:doubleclick');
    expect(labels).toContain('on:keydown');
    expect(labels).toContain('on:dblclick');
    expect(labels).toContain('on:esc');
    expect(labels).toContain('on:keyup');
    expect(labels).toContain('on:submit');
    expect(labels).toContain('on:input');
    expect(labels).toContain('on:change');
    expect(labels).toContain('on:focus');
    expect(labels).toContain('on:blur');
    expect(labels).toContain('on:pointerdown');
    expect(labels).toContain('on:pointerup');
    expect(labels).toContain('on:pointermove');
    expect(labels).toContain('on:pointerenter');
    expect(labels).toContain('on:pointerleave');
    expect(labels).toContain('on:hoverin');
    expect(labels).toContain('on:hoverout');
    expect(labels).toContain('on:dragstart');
    expect(labels).toContain('on:dragover');
    expect(labels).toContain('on:drop');
    expect(labels).toContain('on:scroll');
    expect(labels).toContain('on:contextmenu');
    expect(labels).toContain('onClick={handler}');
  });

  test('uses canonical doc-backed detail text for targeted primitives and event aliases', () => {
    const scriptItems = getCompletionItems(`<script lang="ts">\nzen\n</script>`, { line: 1, character: 3 });
    const attrItems = getCompletionItems(`<button on></button>`, { line: 0, character: 10 });

    const zenOn = scriptItems.find((item) => item.label === 'zenOn');
    const zenWindow = scriptItems.find((item) => item.label === 'zenWindow');
    const onEsc = attrItems.find((item) => item.label === 'on:esc');
    const onHoverIn = attrItems.find((item) => item.label === 'on:hoverin');
    const onHoverOut = attrItems.find((item) => item.label === 'on:hoverout');

    expect(zenOn?.detail).toContain('Canonical event subscription primitive');
    expect(zenWindow?.detail).toContain('SSR-safe window accessor');
    expect(onEsc?.detail).toContain('Escape-filtered keydown alias');
    expect(onHoverIn?.detail).toContain('pointerenter');
    expect(onHoverOut?.detail).toContain('pointerleave');
  });

  test('uses canonical doc-backed detail text for the documented on:* event set', () => {
    const attrItems = getCompletionItems(`<button on></button>`, { line: 0, character: 10 });
    const cases = [
      { label: 'on:click', fragment: 'mouse click binding' },
      { label: 'on:doubleclick', fragment: 'normalizes doubleclick bindings' },
      { label: 'on:dblclick', fragment: 'double-click binding' },
      { label: 'on:keydown', fragment: 'keyboard keydown binding' },
      { label: 'on:keyup', fragment: 'keyboard keyup binding' },
      { label: 'on:submit', fragment: 'form submit binding' },
      { label: 'on:input', fragment: 'immediate form-value updates' },
      { label: 'on:change', fragment: 'committed form-value updates' },
      { label: 'on:focus', fragment: 'focus transitions' },
      { label: 'on:blur', fragment: 'focus exit transitions' },
      { label: 'on:pointerdown', fragment: 'recommended pointer event set' },
      { label: 'on:pointerup', fragment: 'recommended pointer event set' },
      { label: 'on:pointermove', fragment: 'recommended pointer event set' },
      { label: 'on:pointerenter', fragment: 'alongside on:hoverin' },
      { label: 'on:pointerleave', fragment: 'alongside on:hoverout' },
      { label: 'on:dragstart', fragment: 'recommended drag event set' },
      { label: 'on:dragover', fragment: 'recommended drag event set' },
      { label: 'on:drop', fragment: 'recommended drag event set' },
      { label: 'on:scroll', fragment: 'recommended event set' },
      { label: 'on:contextmenu', fragment: 'recommended mouse event set' }
    ] as const;

    for (const { label, fragment } of cases) {
      const item = attrItems.find((entry) => entry.label === label);
      expect(item?.detail).toContain(fragment);
      if (item?.documentation && typeof item.documentation === 'object' && 'value' in item.documentation) {
        expect(item.documentation.value).toContain('docs/documentation/syntax/events.md');
      } else {
        expect(item?.documentation).toBeDefined();
      }
    }
  });

  test('event completion insertText uses valid VS Code snippet syntax', () => {
    const attrItems = getCompletionItems(`<button on></button>`, { line: 0, character: 10 });
    const eventItems = attrItems.filter((item) => typeof item.label === 'string' && item.label.startsWith('on:'));

    expect(eventItems.length).toBeGreaterThan(0);

    for (const item of eventItems) {
      const text = typeof item.insertText === 'string' ? item.insertText : '';
      expect(text).toContain('${1:handler}');
      expect(text).not.toMatch(/\$1:handler/);
    }

    const propItem = attrItems.find((item) => item.label === 'onClick={handler}');
    expect(propItem).toBeDefined();
    const propText = typeof propItem!.insertText === 'string' ? propItem!.insertText : '';
    expect(propText).toContain('${1:handler}');
  });
});
