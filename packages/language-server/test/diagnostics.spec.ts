import { describe, expect, test } from 'bun:test';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { collectDiagnosticsFromSource } from '../src/diagnostics.js';

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
});
