import { describe, expect, test } from 'bun:test';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { collectDiagnosticsFromSource, mapCompilerEnvelopeToDiagnostics } from '../src/diagnostics.js';

describe('diagnostics', () => {
  const source = `<script lang="ts">\nconst el = document.querySelector('.x')\n</script>\n<div class="x"></div>`;

  test('maps compiler warnings to LSP diagnostics', async () => {
    const diagnostics = await collectDiagnosticsFromSource(source, '/tmp/example.zen', false);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.code).toBe('ZEN-DOM-QUERY');
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Warning);
  });

  test('promotes ZEN-DOM warnings to errors in strict mode', async () => {
    const diagnostics = await collectDiagnosticsFromSource(source, '/tmp/example.zen', true);
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Error);
  });

  test('maps structured script-boundary diagnostics from compiler output', async () => {
    const diagnostics = await collectDiagnosticsFromSource(
      `<script>const x = 1</script>\n<main>{x}</main>`,
      '/tmp/script-boundary.zen',
      false
    );

    expect(diagnostics[0]?.code).toBe('ZEN-SCRIPT-MISSING-TS');
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostics[0]?.message).toContain('Zenith requires TypeScript scripts');
  });

  test('maps structured invalid-event diagnostics from compiler output', async () => {
    const diagnostics = await collectDiagnosticsFromSource(
      `<button on:click={doThing()}></button>`,
      '/tmp/invalid-event.zen',
      false
    );

    expect(diagnostics[0]?.code).toBe('ZEN-EVT-DIRECT-CALL');
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostics[0]?.message).toContain('direct call expressions');
  });

  test('preserves unknown-event warning text and suggestion text from diagnostics', async () => {
    const diagnostics = await collectDiagnosticsFromSource(
      `<button on:clcik={handleClick}></button>`,
      '/tmp/unknown-event.zen',
      false
    );

    expect(diagnostics[0]?.code).toBe('ZEN-EVT-UNKNOWN');
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Warning);
    expect(diagnostics[0]?.message).toContain(`Did you mean 'click'`);
  });

  test('falls back to legacy warnings when diagnostics[] is absent', () => {
    const diagnostics = mapCompilerEnvelopeToDiagnostics(
      {
        schemaVersion: 1,
        warnings: [
          {
            code: 'ZEN-DOM-QUERY',
            message: 'Use ref<T>() instead.',
            severity: 'warning',
            range: {
              start: { line: 2, column: 3 },
              end: { line: 2, column: 8 }
            }
          }
        ]
      },
      false
    );

    expect(diagnostics[0]?.code).toBe('ZEN-DOM-QUERY');
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Warning);
  });

  test('strictDomLints promotion remains limited to ZEN-DOM diagnostics', () => {
    const diagnostics = mapCompilerEnvelopeToDiagnostics(
      {
        schemaVersion: 1,
        diagnostics: [
          {
            code: 'ZEN-EVT-UNKNOWN',
            message: 'Unknown DOM event',
            severity: 'warning',
            source: 'compiler',
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 2 }
            }
          }
        ]
      },
      true
    );

    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Warning);
  });
});
