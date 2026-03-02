/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  transform: {},
  verbose: true,
  testMatch: ['<rootDir>/**/*.spec.js'],
  // Keep CLI imports stable for ESM tests that import zenith-cli source directly.
  moduleNameMapper: {
    '^@zenithbuild/compiler$': '<rootDir>/../../packages/compiler/dist/index.js'
  }
};
