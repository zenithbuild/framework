import { describe, expect, test } from 'bun:test';
import { getHover } from '../src/hover.js';

function hoverValue(hover: ReturnType<typeof getHover>): string {
  const contents = hover?.contents;
  if (!contents || typeof contents !== 'object' || !('value' in contents)) {
    return '';
  }
  return typeof contents.value === 'string' ? contents.value : '';
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
});
