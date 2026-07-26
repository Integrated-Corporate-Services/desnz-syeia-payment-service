// Jest Configuration for Unit Tests
module.exports = {
  displayName: 'Unit Tests',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/unit/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/', '/dist/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.d.ts', '!src/**/index.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
