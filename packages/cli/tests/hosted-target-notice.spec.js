import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { ZENITH_TARGETS } from '@zenithbuild/core/config';
import { hostedTargetVerificationNotice } from '../dist/adapters/hosted-target-notice.js';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(60000);

const HOSTED_NOTICES = {
    vercel: 'Target "vercel" is built and conformance-tested; not live-verified on Vercel.',
    netlify: 'Target "netlify" is built and conformance-tested; not live-verified on Netlify.',
    'vercel-static': 'Target "vercel-static" is built and conformance-tested; not live-verified on Vercel.',
    'netlify-static': 'Target "netlify-static" is built and conformance-tested; not live-verified on Netlify.'
};

const NON_HOSTED_TARGETS = ['static', 'static-export', 'node'];

async function createProject(files) {
    const root = join(tmpdir(), `zenith-hosted-notice-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function captureStdout(run) {
    const chunks = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, encoding, callback) => {
        chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        const done = typeof encoding === 'function' ? encoding : callback;
        if (typeof done === 'function') {
            done();
        }
        return true;
    };
    try {
        const result = await run();
        return { result, output: chunks.join('') };
    } catch (error) {
        error.capturedOutput = chunks.join('');
        throw error;
    } finally {
        process.stdout.write = original;
    }
}

describe('hosted target verification notice', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test('canonical hosted targets get one conformance line and other targets do not', () => {
        expect(ZENITH_TARGETS).toEqual(expect.arrayContaining([
            ...Object.keys(HOSTED_NOTICES),
            ...NON_HOSTED_TARGETS
        ]));

        for (const target of ZENITH_TARGETS) {
            const notice = hostedTargetVerificationNotice(target);
            if (Object.prototype.hasOwnProperty.call(HOSTED_NOTICES, target)) {
                expect(notice).toBe(HOSTED_NOTICES[target]);
                expect(notice.includes('\n')).toBe(false);
                continue;
            }
            expect(notice).toBeNull();
        }

        for (const target of NON_HOSTED_TARGETS) {
            expect(hostedTargetVerificationNotice(target)).toBeNull();
        }
        expect(hostedTargetVerificationNotice('legacy')).toBeNull();
        expect(hostedTargetVerificationNotice('static')).toBeNull();
    });

    test.each(Object.keys(HOSTED_NOTICES))(
        'zenith build for %s prints the conformance notice',
        async (target) => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'zenith.config.js': `module.exports = { target: "${target}" };\n`
            });

            const { output } = await captureStdout(() => cli(['build'], projectRoot));
            expect(output).toContain(HOSTED_NOTICES[target]);
            expect(output).toContain('not live-verified');
        }
    );

    test.each(NON_HOSTED_TARGETS)(
        'zenith build for %s does not claim host live-verification',
        async (target) => {
            projectRoot = await createProject({
                'pages/index.zen': '<main>home</main>\n',
                'zenith.config.js': `module.exports = { target: "${target}" };\n`
            });

            const { output } = await captureStdout(() => cli(['build'], projectRoot));
            expect(output).not.toContain('live-verified');
            expect(output).not.toContain('conformance-tested');
        }
    );

    test('hosted download routes still fail fast with the same build error', async () => {
        projectRoot = await createProject({
            'pages/api/export.resource.ts': [
                'export async function load(ctx) {',
                '  return ctx.download("blocked", { filename: "blocked.txt" });',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "vercel" };\n'
        });

        let captured = '';
        try {
            await captureStdout(() => cli(['build'], projectRoot));
            throw new Error('expected hosted download build to fail');
        } catch (error) {
            if (error.message === 'expected hosted download build to fail') {
                throw error;
            }
            captured = error.capturedOutput || '';
            expect(error.message).toContain(
                'target "vercel" does not support resource downloads in this milestone'
            );
        }
        expect(captured).toContain(HOSTED_NOTICES.vercel);
    });
});
