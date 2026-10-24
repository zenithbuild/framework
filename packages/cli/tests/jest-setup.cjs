const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

// Respect explicit pins (CI uses release workspace binary; developers may set ZENITH_COMPILER_BIN).
// Prefer release over debug so local Jest matches scripts/ci.sh and the staged npm artifact.
if (!process.env.ZENITH_COMPILER_BIN || String(process.env.ZENITH_COMPILER_BIN).length === 0) {
    const root = resolve(__dirname, '../..');
    const release = resolve(root, 'compiler/target/release/zenith-compiler');
    const debug = resolve(root, 'compiler/target/debug/zenith-compiler');
    if (existsSync(release)) {
        process.env.ZENITH_COMPILER_BIN = release;
    } else if (existsSync(debug)) {
        process.env.ZENITH_COMPILER_BIN = debug;
    }
}
