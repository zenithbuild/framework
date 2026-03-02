import { jest } from '@jest/globals';
import { hydrate } from '../src/hydrate.js';
import { cleanup } from '../src/cleanup.js';

describe('runtime diagnostics logging', () => {
    const OVERLAY_ID = '__zenith_runtime_error_overlay';
    let container;
    let previousNodeEnv;
    let previousTestMode;
    let previousLogFlag;
    let previousDevFlag;

    function restoreEnv(name, value) {
        if (value === undefined) {
            delete process.env[name];
            return;
        }
        process.env[name] = value;
    }

    function triggerKnownRuntimeError() {
        container.innerHTML = '<section data-zx-e="0"></section>';

        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'contributors.map((c) => (__z_frag_1(c.tier)))' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: []
            });
        } catch (error) {
            return error;
        }

        throw new Error('Expected hydrate() to throw a Zenith runtime error');
    }

    beforeEach(() => {
        previousNodeEnv = process.env.NODE_ENV;
        previousTestMode = process.env.ZENITH_TEST_MODE;
        previousLogFlag = process.env.ZENITH_LOG_RUNTIME_ERRORS;
        previousDevFlag = globalThis.__ZENITH_RUNTIME_DEV__;
        globalThis.__ZENITH_RUNTIME_DEV__ = false;

        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        cleanup();
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }

        restoreEnv('NODE_ENV', previousNodeEnv);
        restoreEnv('ZENITH_TEST_MODE', previousTestMode);
        restoreEnv('ZENITH_LOG_RUNTIME_ERRORS', previousLogFlag);
        globalThis.__ZENITH_RUNTIME_DEV__ = previousDevFlag;
    });

    test('suppresses console logging for expected runtime errors in test mode', () => {
        process.env.NODE_ENV = 'test';
        delete process.env.ZENITH_TEST_MODE;
        delete process.env.ZENITH_LOG_RUNTIME_ERRORS;

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const thrown = triggerKnownRuntimeError();

        expect(thrown.zenithRuntimeError.kind).toBe('ZENITH_RUNTIME_ERROR');
        expect(thrown.zenithRuntimeError.code).toBe('UNRESOLVED_EXPRESSION');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('logs runtime errors in test mode when ZENITH_LOG_RUNTIME_ERRORS=1', () => {
        process.env.NODE_ENV = 'test';
        delete process.env.ZENITH_TEST_MODE;
        process.env.ZENITH_LOG_RUNTIME_ERRORS = '1';

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const thrown = triggerKnownRuntimeError();

        expect(thrown.zenithRuntimeError.kind).toBe('ZENITH_RUNTIME_ERROR');
        expect(thrown.zenithRuntimeError.code).toBe('UNRESOLVED_EXPRESSION');
        expect(consoleErrorSpy).toHaveBeenCalledWith('[Zenith Runtime]', thrown.zenithRuntimeError);
    });
});
