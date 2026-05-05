// Jest Configuration for Integration Tests
module.exports = {
  displayName: 'Integration Tests',
  testEnvironment: 'node',
  testMatch: ['**/integration/**/*.test.ts', '**/integration/**/*.test.js'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
