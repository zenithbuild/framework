import { runtimeModuleSource } from '@zenithbuild/runtime/template';
import { renderRouterModule } from '@zenithbuild/router/template';

const IR_VERSION = 1;

function normalizeNewlines(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

async function main() {
  const rawInput = await readStdin();
  const parsed = rawInput.trim().length > 0 ? JSON.parse(rawInput) : {};

  const manifestJson = typeof parsed.manifestJson === 'string'
    ? normalizeNewlines(parsed.manifestJson)
    : '{}';
  const runtimeImport = typeof parsed.runtimeImport === 'string' && parsed.runtimeImport.length > 0
    ? parsed.runtimeImport
    : '/assets/runtime.placeholder.js';
  const coreImport = typeof parsed.coreImport === 'string' && parsed.coreImport.length > 0
    ? parsed.coreImport
    : '/assets/core.placeholder.js';

  const runtimeSource = normalizeNewlines(runtimeModuleSource());
  const routerSource = normalizeNewlines(
    renderRouterModule({
      manifestJson,
      runtimeImport,
      coreImport
    })
  );

  // Keep output key order deterministic.
  const output = {
    irVersion: IR_VERSION,
    runtimeSource,
    routerSource
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[render-assets] ${message}\n`);
  process.exit(1);
});
