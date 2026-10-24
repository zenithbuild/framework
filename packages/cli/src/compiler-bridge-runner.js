import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ bridgeModule: string, filePath: string, stdin: boolean, version: boolean }} BridgeArgs
 */

/**
 * @param {string[]} argv
 * @returns {BridgeArgs}
 */
function readArgs(argv) {
    /** @type {BridgeArgs} */
    const args = {
        bridgeModule: '',
        filePath: '',
        stdin: false,
        version: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--version') {
            args.version = true;
            continue;
        }
        if (token === '--bridge-module') {
            args.bridgeModule = argv[index + 1] || '';
            index += 1;
            continue;
        }
        if (token === '--stdin') {
            args.stdin = true;
            args.filePath = argv[index + 1] || '';
            index += 1;
            continue;
        }
        if (!token.startsWith('--') && !args.filePath) {
            args.filePath = token;
        }
    }

    return args;
}

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    }
    return chunks.join('');
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    if (!args.bridgeModule) {
        throw new Error('Missing --bridge-module');
    }
    if (args.version) {
        const manifest = JSON.parse(await readFile(resolve(dirname(args.bridgeModule), '../package.json'), 'utf8'));
        if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
            throw new Error('Compiler bridge package must declare a valid release version');
        }
        process.stdout.write(`zenith-compiler ${manifest.version}\n`);
        return;
    }
    if (!args.filePath) {
        throw new Error('Missing compiler file path');
    }

    const bridgeModuleUrl = pathToFileURL(args.bridgeModule).href;
    const bridgeModule = await import(bridgeModuleUrl);
    if (typeof bridgeModule.compile !== 'function') {
        throw new Error('Compiler bridge does not export compile()');
    }

    const result = args.stdin
        ? await bridgeModule.compile({
            source: await readStdin(),
            filePath: args.filePath
        })
        : await bridgeModule.compile(args.filePath);

    process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message) {
        process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
});
