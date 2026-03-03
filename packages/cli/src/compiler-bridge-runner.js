import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function readArgs(argv) {
    const args = {
        bridgeModule: '',
        filePath: '',
        stdin: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
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

main().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message) {
        process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
});
