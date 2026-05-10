/** @type {import('jest').Config} */
export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: [
        '**/tests/config.spec.js',
        '**/tests/define-config.spec.js',
        '**/tests/path.spec.js',
        '**/tests/order.spec.js',
        '**/tests/hash.spec.js',
        '**/tests/errors.spec.js',
        '**/tests/version.spec.js',
        '**/tests/guards.spec.js',
        '**/tests/guardrails.spec.js',
        '**/tests/ir-schema.spec.js',
        '**/tests/bin-entrypoint-batch4.spec.js',
        '**/tests/core-template.spec.js',
        '**/tests/side-effects.spec.js',
        '**/tests/package-surface.spec.js'
    ]
};
