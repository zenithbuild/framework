#!/usr/bin/env node

import {
    listPublishMatrixLines,
    verifyPublishSurface
} from './publish-surface-lib.mjs';

function usage() {
    console.error(
        'Usage: node scripts/verify-publish-surface.mjs [--selection all|framework|platform|release|scaffolder] [--filter csv] [--list]'
    );
}

function parseArgs(argv) {
    const options = {
        selection: 'all',
        filter: '',
        list: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--selection') {
            options.selection = argv[index + 1] || '';
            index += 1;
            continue;
        }
        if (arg === '--filter') {
            options.filter = argv[index + 1] || '';
            index += 1;
            continue;
        }
        if (arg === '--list') {
            options.list = true;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            options.help = true;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        process.exit(0);
    }

    if (options.list) {
        const lines = listPublishMatrixLines({
            selection: options.selection,
            filter: options.filter
        });
        process.stdout.write(`${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`);
        return;
    }

    const results = verifyPublishSurface({
        selection: options.selection,
        filter: options.filter
    });

    console.log(`Verified publish surface for ${results.length} package(s).`);
    for (const result of results) {
        console.log(`- ${result.name} (${result.dir})`);
    }
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Unknown argument:')) {
        usage();
    }
    console.error(message);
    process.exit(1);
}
