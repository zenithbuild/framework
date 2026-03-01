import { createZenithLogger } from '../src/ui/logger.js';

function createRuntime(env = {}) {
    const stdout = [];
    const stderr = [];
    return {
        env: {
            CI: '1',
            NO_COLOR: '1',
            ...env
        },
        stdout: {
            isTTY: false,
            write(value) {
                stdout.push(String(value));
            }
        },
        stderr: {
            isTTY: false,
            write(value) {
                stderr.push(String(value));
            }
        },
        output() {
            return {
                stdout: stdout.join('').replace(/\r/g, ''),
                stderr: stderr.join('').replace(/\r/g, '')
            };
        }
    };
}

describe('zenith logger', () => {
    test('dedupes repeated warnings with the same onceKey', () => {
        const runtime = createRuntime();
        const logger = createZenithLogger(runtime);

        logger.warn('legacy HMR endpoint in use', {
            hint: 'use /__zenith_dev/events',
            onceKey: 'legacy-hmr'
        });
        logger.warn('legacy HMR endpoint in use', {
            hint: 'use /__zenith_dev/events',
            onceKey: 'legacy-hmr'
        });
        logger.warn('compiler mismatch detected', { onceKey: 'compiler-mismatch' });

        const { stderr } = runtime.output();
        expect(stderr.match(/legacy HMR endpoint in use/g) || []).toHaveLength(1);
        expect(stderr.match(/compiler mismatch detected/g) || []).toHaveLength(1);
    });

    test('formats child bundler lines into structured build output', () => {
        const runtime = createRuntime();
        const logger = createZenithLogger(runtime);

        logger.childLine('bundler', '[zenith] Vendor cache hit: 18dc26edee6ffe36', { showInfo: true });
        logger.childLine('bundler', '[zenith] Vendor cache hit: 18dc26edee6ffe36', { showInfo: true });
        logger.childLine('bundler', '[zenith] Vendor bundle: vendor.146fe6c6.js (3 specifiers matched)', { showInfo: true });

        const { stdout } = runtime.output();
        expect(stdout).toMatchInlineSnapshot(`
"[zenith] • BUILD  vendor cache hit (18dc26edee6ffe36)
[zenith] • BUILD  vendor bundle vendor.146fe6c6.js (3 specifiers matched)
"
`);
    });

    test('emits verbose router lines only in verbose mode', () => {
        const quietRuntime = createRuntime();
        const quietLogger = createZenithLogger(quietRuntime);
        quietLogger.verbose('ROUTER', 'GET / -> /');
        expect(quietRuntime.output().stdout).toBe('');

        const verboseRuntime = createRuntime({ ZENITH_LOG_LEVEL: 'verbose' });
        const verboseLogger = createZenithLogger(verboseRuntime);
        verboseLogger.verbose('ROUTER', 'GET / -> /');
        expect(verboseRuntime.output().stdout).toContain('[zenith] • ROUTER GET / -> /');
    });
});
