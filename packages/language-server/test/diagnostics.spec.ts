import { describe, expect, test } from 'bun:test';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import {
  collectDiagnosticsFromSource,
  createDiagnosticsCollector,
  mapCompilerEnvelopeToDiagnostics
} from '../src/diagnostics.js';

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

  test('preserves native DOM event syntax rejection while allowing component handler props', async () => {
    const nativeDiagnostics = await collectDiagnosticsFromSource(
      `<script lang="ts">\nfunction handleClick() {}\n</script>\n<button onClick={handleClick}></button>`,
      '/tmp/native-onclick.zen',
      false
    );

    expect(nativeDiagnostics[0]?.code).toBe('ZEN-EVT-FOREIGN-SYNTAX');
    expect(nativeDiagnostics[0]?.severity).toBe(DiagnosticSeverity.Error);

    const componentCases = [
      {
        label: 'custom component onClick prop',
        source: `<script lang="ts">\nfunction handleClick() {}\n</script>\n<MenuButton onClick={handleClick}></MenuButton>`
      },
      {
        label: 'custom component onPress prop',
        source: `<script lang="ts">\nfunction toggleMenu() {}\n</script>\n<MenuButton onPress={toggleMenu}></MenuButton>`
      },
      {
        label: 'component bridge back to canonical event syntax',
        source: [
          '<script lang="ts">',
          'const incoming = props as { onPress?: () => void }',
          'const onPress = incoming.onPress',
          '</script>',
          '<button on:click={onPress}>menu</button>'
        ].join('\n')
      }
    ];

    for (const { label, source } of componentCases) {
      const diagnostics = await collectDiagnosticsFromSource(source, `/tmp/${label}.zen`, false);
      expect(diagnostics).toEqual([]);
    }
  });

  test('recognizes built-in Image as a valid compiler-backed component in editor diagnostics', async () => {
    const diagnostics = await collectDiagnosticsFromSource(
      '<main><Image src="/hero.png" alt="Hero" sizes="100vw" /></main>',
      '/tmp/image-component.zen',
      false
    );

    expect(diagnostics).toEqual([]);
  });

  test('preserves unknown-event warning text and suggestion text from diagnostics', async () => {
    const diagnostics = await collectDiagnosticsFromSource(
      `<script lang="ts">\nfunction handleClick() {}\n</script>\n<button on:clcik={handleClick}></button>`,
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

  test('compiler-unavailable diagnostics are actionable, sanitized, and emitted once', async () => {
    const collectWithMissingCompiler = createDiagnosticsCollector({
      async loadCompiler() {
        throw new Error('Cannot find module @zenithbuild/compiler\n    at /private/tmp/raw-stack.js:1:1');
      }
    });

    const first = await collectWithMissingCompiler(
      '<main>Hello</main>',
      '/tmp/compiler-unavailable-a.zen',
      false
    );
    const second = await collectWithMissingCompiler(
      '<main>Again</main>',
      '/tmp/compiler-unavailable-b.zen',
      false
    );

    expect(first).toHaveLength(1);
    expect(first[0]?.code).toBe('ZENITH-COMPILER-UNAVAILABLE');
    expect(first[0]?.severity).toBe(DiagnosticSeverity.Warning);
    expect(first[0]?.message).toContain('Run your package manager install from the workspace root');
    expect(first[0]?.message).toContain('@zenithbuild/compiler');
    expect(first[0]?.message).not.toContain('Cannot find module');
    expect(first[0]?.message).not.toContain('raw-stack');
    expect(second).toEqual([]);
  });
});
