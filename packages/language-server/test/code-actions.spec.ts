import { describe, expect, test } from 'bun:test';
import type { Diagnostic } from 'vscode-languageserver/node';
import { getCodeActions } from '../src/code-actions.js';

function diagnostic(code: string, line = 1, character = 0): Diagnostic {
  return {
    code,
    message: code,
    source: 'zenith',
    severity: 2,
    range: {
      start: { line, character },
      end: { line, character: character + 1 }
    }
  };
}

describe('code actions', () => {
  test('returns a Zenith suppression action for ZEN-DOM-QUERY', () => {
    const text = `<script lang="ts">\nconst el = document.querySelector('.x')\n</script>`;
    const actions = getCodeActions(text, 'file:///tmp/example.zen', [diagnostic('ZEN-DOM-QUERY')]);

    expect(actions).toHaveLength(1);
    expect(actions[0]?.title).toBe('Zenith: Suppress DOM query with zen-allow comment');
    const edit = actions[0]?.edit?.documentChanges?.[0];
    expect(edit && 'edits' in edit ? edit.edits[0]?.newText : '').toContain('zen-allow:dom-query');
  });

  test('returns a Zenith migration note for ZEN-DOM-LISTENER', () => {
    const text = `<script lang="ts">\nwindow.addEventListener('resize', onResize)\n</script>`;
    const actions = getCodeActions(text, 'file:///tmp/example.zen', [diagnostic('ZEN-DOM-LISTENER')]);

    expect(actions).toHaveLength(1);
    expect(actions[0]?.title).toBe('Zenith: Add zenOn migration note');
    const edit = actions[0]?.edit?.documentChanges?.[0];
    const newText = edit && 'edits' in edit ? edit.edits[0]?.newText ?? '' : '';
    expect(newText).toContain('replace addEventListener with zenOn');
    expect(newText).toContain('ctx.cleanup');
  });

  test('returns deterministic wrapper actions for ZEN-DOM-WRAPPER', () => {
    const text = `<script lang="ts">\nconst doc = globalThis.document\n</script>`;
    const actions = getCodeActions(text, 'file:///tmp/example.zen', [diagnostic('ZEN-DOM-WRAPPER')]);

    expect(actions).toHaveLength(2);
    expect(actions[0]?.title).toBe('Zenith: Replace globalThis.document with zenDocument()');
    const replacement = actions[0]?.edit?.documentChanges?.[0];
    expect(replacement && 'edits' in replacement ? replacement.edits[0]?.newText : '').toBe('zenDocument()');
    expect(actions[1]?.title).toBe('Zenith: Add zenWindow/zenDocument migration note');
  });

  test('returns no actions for unsupported diagnostics', () => {
    const text = `<button on:clcik={handleClick}></button>`;
    const actions = getCodeActions(text, 'file:///tmp/example.zen', [diagnostic('ZEN-EVT-UNKNOWN', 0, 8)]);

    expect(actions).toHaveLength(0);
  });
});
