import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = (callback) => {
        return setTimeout(() => callback(performance.now()), 0);
    };
}

if (typeof globalThis.cancelAnimationFrame === 'undefined') {
    globalThis.cancelAnimationFrame = (id) => {
        clearTimeout(id);
    };
}
