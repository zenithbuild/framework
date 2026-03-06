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
    expect(labels).not.toContain('react');
    expect(labels).not.toContain('vue');
    expect(labels).not.toContain('svelte');
  });

  test('returns canonical on:* suggestions in attribute contexts', () => {
    const text = `<button on></button>`;
    const items = getCompletionItems(text, { line: 0, character: 10 });
    const labels = items.map((item) => item.label);

    expect(labels).toContain('on:click');
    expect(labels).toContain('on:keydown');
    expect(labels).toContain('onClick={handler}');
  });
});
