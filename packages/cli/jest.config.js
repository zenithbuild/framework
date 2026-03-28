/** @type {import('jest').Config} */
export default {
    setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.cjs'],
    testEnvironment: 'node',
    transform: {},
    testMatch: ['**/tests/**/*.spec.js']
};
