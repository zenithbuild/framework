import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jestPackageJson = require.resolve('jest/package.json');
const jestBin = path.join(path.dirname(jestPackageJson), 'bin', 'jest.js');

const CI_SPECS = [
  'phase1-cli-compiler.spec.js',
  'phase2-compiler-bundler.spec.js',
  'phase3-bundler-output.spec.js',
  'phase4-runtime.spec.js',
  'phase5-router.spec.js',
  'phase6-dev-server.spec.js',
  'phase7-preview.spec.js',
  'phase8-pm-neutrality.spec.js',
  'phase9-boundaries.spec.js',
  'phase10-e2e.spec.js',
  'phase11-script-boundary.spec.js',
  'phase12-hydration-contract.spec.js',
  'phase13-component-script-hoisting.spec.js',
  'phase_imports.spec.js',
  'phase_server_script_prerender.spec.js',
  'phase_preview_ssr.spec.js',
  'phase_component_props.spec.js',
  'phase_no_bare_specifiers.spec.js',
  'phase_zeneffect.spec.js',
  'phase14-component-determinism.spec.js',
  'phase15-stress.spec.js',
  'phase16-forbidden-primitives.spec.js',
  'phase17-runtime-stability.spec.js',
  'phase18-component-props-stress.spec.js'
];

function parsePositiveInt(rawValue, label) {
  const value = Number.parseInt(rawValue ?? '1', 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer. Received: ${rawValue}`);
  }
  return value;
}

const shardTotal = parsePositiveInt(process.env.ZENITH_CI_SHARD_TOTAL, 'ZENITH_CI_SHARD_TOTAL');
const shardIndex = parsePositiveInt(process.env.ZENITH_CI_SHARD_INDEX, 'ZENITH_CI_SHARD_INDEX');

if (shardIndex > shardTotal) {
  throw new Error(
    `ZENITH_CI_SHARD_INDEX (${shardIndex}) must be less than or equal to ZENITH_CI_SHARD_TOTAL (${shardTotal}).`
  );
}

const selectedSpecs = CI_SPECS.filter((_, index) => index % shardTotal === shardIndex - 1);
if (selectedSpecs.length === 0) {
  throw new Error(`No integration specs selected for shard ${shardIndex}/${shardTotal}.`);
}

console.log(`[integration-ci] shard ${shardIndex}/${shardTotal}`);
for (const spec of selectedSpecs) {
  console.log(`[integration-ci] - ${spec}`);
}

const nodeOptions = new Set(
  (process.env.NODE_OPTIONS ?? '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
);
nodeOptions.add('--experimental-vm-modules');

const child = spawn(
  process.execPath,
  [jestBin, '--config', './jest.config.js', '--runInBand', '--bail', ...selectedSpecs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: Array.from(nodeOptions).join(' ')
    }
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
