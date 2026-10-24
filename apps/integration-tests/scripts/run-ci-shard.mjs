import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { collectIntegrationShardSpecs, selectShardSpecs } from './shard-specs.mjs';

const require = createRequire(import.meta.url);
const jestPackageJson = require.resolve('jest/package.json');
const jestBin = path.join(path.dirname(jestPackageJson), 'bin', 'jest.js');

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

const ciSpecs = collectIntegrationShardSpecs();
const selectedSpecs = selectShardSpecs(ciSpecs, shardIndex, shardTotal);
if (selectedSpecs.length === 0) {
  throw new Error(`No integration specs selected for shard ${shardIndex}/${shardTotal}.`);
}

function timestamp() {
  return new Date().toISOString();
}

function logIntegration(message) {
  console.log(`[integration-ci][${timestamp()}] shard=${shardIndex}/${shardTotal} ${message}`);
}

function formatElapsed(startTimeMs) {
  return `${((Date.now() - startTimeMs) / 1000).toFixed(1)}s`;
}

function quoteArg(value) {
  return JSON.stringify(value);
}

logIntegration(`event=shard_start total_specs=${selectedSpecs.length}`);
for (const spec of selectedSpecs) {
  logIntegration(`event=spec_selected spec=${spec}`);
}

const nodeOptions = new Set(
  (process.env.NODE_OPTIONS ?? '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
);
nodeOptions.add('--experimental-vm-modules');

const jestArgs = ['--config', './jest.config.js', '--runInBand', '--bail', ...selectedSpecs];
const shardStartTime = Date.now();
let heartbeatTimer = null;

const child = spawn(
  process.execPath,
  [jestBin, ...jestArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: Array.from(nodeOptions).join(' ')
    }
  }
);

child.on('spawn', () => {
  const command = [process.execPath, jestBin, ...jestArgs].map(quoteArg).join(' ');
  logIntegration(`event=jest_spawn pid=${child.pid ?? 'unknown'} command=${command}`);

  const heartbeatMs = Number.parseInt(process.env.ZENITH_CI_HEARTBEAT_MS ?? '30000', 10);
  heartbeatTimer = setInterval(() => {
    logIntegration(
      `event=jest_heartbeat pid=${child.pid ?? 'unknown'} elapsed=${formatElapsed(shardStartTime)}`
    );
  }, Number.isInteger(heartbeatMs) && heartbeatMs > 0 ? heartbeatMs : 30000);
});

child.on('exit', (code, signal) => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  logIntegration(
    `event=jest_exit pid=${child.pid ?? 'unknown'} elapsed=${formatElapsed(shardStartTime)} code=${code ?? 'null'} signal=${signal ?? 'none'}`
  );

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  logIntegration(
    `event=jest_error pid=${child.pid ?? 'unknown'} elapsed=${formatElapsed(shardStartTime)} message=${JSON.stringify(error.message)}`
  );
  console.error(error);
  process.exit(1);
});
