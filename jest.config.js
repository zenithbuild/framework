/** @type {import('jest').Config} */
export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: [
        '**/tests/manifest.spec.js',
        '**/tests/build.spec.js',
        '**/tests/dev.spec.js'
    ]
};
