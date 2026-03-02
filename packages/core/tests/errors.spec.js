// ---------------------------------------------------------------------------
// errors.spec.js — Error formatting tests
// ---------------------------------------------------------------------------

import { createError, formatError, isZenithError, ErrorCodes } from '../src/errors.js';

describe('createError', () => {
    test('creates Error with Zenith prefix', () => {
        const err = createError('Config', 'Unknown key');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('[Zenith:Config] Unknown key');
    });

    test('attaches zenithModule property', () => {
        const err = createError('Path', 'Invalid param');
        expect(err.zenithModule).toBe('Path');
    });

    test('different modules produce different prefixes', () => {
        const errA = createError('Config', 'test');
        const errB = createError('Build', 'test');
        expect(errA.message).not.toBe(errB.message);
    });
});

describe('formatError', () => {
    test('formats with module prefix', () => {
        expect(formatError('Config', 'bad key')).toBe('[Zenith:Config] bad key');
    });

    test('consistent format', () => {
        const result = formatError('Path', 'repeated param');
        expect(result).toMatch(/^\[Zenith:Path\]/);
    });
});

describe('isZenithError', () => {
    test('detects Zenith errors', () => {
        const err = createError('Test', 'msg');
        expect(isZenithError(err)).toBe(true);
    });

    test('rejects non-Zenith errors', () => {
        expect(isZenithError(new Error('regular'))).toBe(false);
    });

    test('rejects non-Error objects', () => {
        expect(isZenithError({ message: 'fake' })).toBe(false);
    });
});

describe('ErrorCodes', () => {
    test('all error codes are strings', () => {
        for (const code of Object.values(ErrorCodes)) {
            expect(typeof code).toBe('string');
        }
    });

    test('expected codes exist', () => {
        expect(ErrorCodes.CONFIG_UNKNOWN_KEY).toBeDefined();
        expect(ErrorCodes.PATH_REPEATED_PARAM).toBeDefined();
        expect(ErrorCodes.VERSION_INCOMPATIBLE).toBeDefined();
        expect(ErrorCodes.GUARD_VIOLATION).toBeDefined();
    });
});
