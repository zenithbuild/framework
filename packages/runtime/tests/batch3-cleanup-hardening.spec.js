import { describe, expect, test, afterEach } from 'bun:test';
import { cleanup, _getCounts, _registerDisposer } from '../dist/cleanup.js';
import { _applyMarkerValue } from '../dist/render.js';
import { _fragment } from '../dist/markup.js';
import { signal } from '../dist/signal.js';
import { zeneffect } from '../dist/zeneffect.js';

afterEach(() => {
    try {
        cleanup();
    } catch {
    }
});

function createDependency() {
    const subscribers = new Set();
    return {
        __zenith_id: Math.floor(Math.random() * 1000000),
        subscribe(fn) {
            subscribers.add(fn);
            return () => subscribers.delete(fn);
        },
        emit() {
            for (const subscriber of [...subscribers]) {
                subscriber();
            }
        },
        activeSubscribers() {
            return subscribers.size;
        }
    };
}

function createStructuralFragment(events, label) {
    let node = null;
    return {
        __zenith_fragment: true,
        mount(parent) {
            node = document.createElement('span');
            node.textContent = label;
            parent.appendChild(node);
        },
        unmount() {
            events.push(node?.parentNode ? `${label}:before-remove` : `${label}:after-remove`);
        }
    };
}

describe('Batch 3 runtime cleanup hardening', () => {
    test('fragment-to-text replacement runs nested cleanup before DOM replacement', () => {
        const host = document.createElement('section');
        const events = [];
        const marker = { index: 0, kind: 'text' };

        _applyMarkerValue([host], marker, createStructuralFragment(events, 'old'));
        expect(host.textContent).toBe('old');

        _applyMarkerValue([host], marker, 'next');

        expect(events).toEqual(['old:before-remove']);
        expect(host.textContent).toBe('next');
    });

    test('fragment-to-HTML replacement runs nested cleanup before DOM replacement', () => {
        const host = document.createElement('section');
        const events = [];
        const marker = { index: 0, kind: 'text' };

        _applyMarkerValue([host], marker, createStructuralFragment(events, 'old'));
        _applyMarkerValue([host], marker, _fragment`<strong>next</strong>`);

        expect(events).toEqual(['old:before-remove']);
        expect(host.innerHTML).toBe('<strong>next</strong>');
    });

    test('cleanup continues after a disposer throws and reports errors after draining', () => {
        const calls = [];
        _registerDisposer(() => {
            calls.push('first');
            throw new Error('first failed');
        });
        _registerDisposer(() => calls.push('second'));

        let thrown = null;
        try {
            cleanup();
        } catch (error) {
            thrown = error;
        }

        expect(calls).toEqual(['first', 'second']);
        expect(thrown).toBeTruthy();
        expect(thrown.message).toContain('[Zenith Runtime] cleanup failed with 1 error(s)');
        expect(thrown.errors || thrown.zenithCleanupErrors).toHaveLength(1);
        expect(_getCounts()).toEqual({ effects: 0, listeners: 0 });
    });

    test('explicit effect setup failure leaves no active dependency subscribers', () => {
        const dep = createDependency();

        expect(() => zeneffect([dep], () => {
            throw new Error('setup failed');
        })).toThrow('setup failed');

        expect(dep.activeSubscribers()).toBe(0);
        dep.emit();
        expect(dep.activeSubscribers()).toBe(0);
    });

    test('auto-tracked setup failure leaves no active signal subscribers', () => {
        const count = signal(0);
        let runs = 0;

        expect(() => zeneffect(() => {
            runs += 1;
            count.get();
            throw new Error('auto setup failed');
        }, { flush: 'sync' })).toThrow('auto setup failed');

        count.set(1);
        expect(runs).toBe(1);
    });

    test('invalid dependency and cleanup registration roll back active subscribers', () => {
        const dep = createDependency();
        expect(() => zeneffect([dep, {}], () => { })).toThrow('dependency at index 1');
        expect(dep.activeSubscribers()).toBe(0);

        expect(() => zeneffect([dep], (ctx) => {
            ctx.cleanup('not a function');
        })).toThrow('cleanup(fn) requires a function');
        expect(dep.activeSubscribers()).toBe(0);
    });

    test('successful explicit effects keep current subscription behavior', () => {
        const dep = createDependency();
        let runs = 0;
        const dispose = zeneffect([dep], () => {
            runs += 1;
        });

        expect(runs).toBe(1);
        expect(dep.activeSubscribers()).toBe(1);
        dep.emit();
        expect(runs).toBe(2);

        dispose();
        expect(dep.activeSubscribers()).toBe(0);
    });
});
