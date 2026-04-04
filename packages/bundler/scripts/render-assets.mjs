import { runtimeModuleProfileSnapshot } from '@zenithbuild/runtime/template';
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
  const routeCheck = parsed.routeCheck === true;
  const formsEnabled = parsed.formsEnabled !== false;
  const runtimeProfile = typeof parsed.runtimeProfile === 'string' && parsed.runtimeProfile.length > 0
    ? parsed.runtimeProfile
    : 'default';

  const runtimeSnapshot = runtimeModuleProfileSnapshot(runtimeProfile);
  const runtimeSource = normalizeNewlines(runtimeSnapshot.source || '');
  const runtimeContributors = Array.isArray(runtimeSnapshot.contributors)
    ? runtimeSnapshot.contributors.map((entry) => ({
      id: String(entry?.id || ''),
      sourceFile: String(entry?.sourceFile || ''),
      bytes: Number.isFinite(entry?.bytes) ? Number(entry.bytes) : 0
    }))
    : [];
  const runtimeCoverageBytes = Number.isFinite(runtimeSnapshot.coverageBytes)
    ? Number(runtimeSnapshot.coverageBytes)
    : Buffer.byteLength(runtimeSource, 'utf8');
  const routerSource = normalizeNewlines(
    renderRouterModule({
      manifestJson,
      runtimeImport,
      coreImport,
      routeCheck,
      formsEnabled
    })
  );

  // Keep output key order deterministic.
  const output = {
    irVersion: IR_VERSION,
    runtimeProfile,
    runtimeSource,
    runtimeContributors,
    runtimeCoverageBytes,
    routerSource
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[render-assets] ${message}\n`);
  process.exit(1);
});
