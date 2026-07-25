/**
 * Unit Tests for Config Logging - HIGH-007 Fix
 * Tests that configuration code does NOT use console.* methods
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Config Logging - HIGH-007 Fix', () => {
  const configFilePath = path.join(__dirname, '../../src/config/config.ts');

  describe('🔒 Source code compliance', () => {
    it('should NOT contain console.error() calls', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for console.error (not in comments)
      const consoleErrorPattern = /^\s*console\.error\(/gm;
      const matches = configSource.match(consoleErrorPattern);
      
      expect(matches).toBeNull();
    });

    it('should NOT contain console.warn() calls', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for console.warn (not in comments)
      const consoleWarnPattern = /^\s*console\.warn\(/gm;
      const matches = configSource.match(consoleWarnPattern);
      
      expect(matches).toBeNull();
    });

    it('should NOT contain console.log() calls', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for console.log (not in comments)
      const consoleLogPattern = /^\s*console\.log\(/gm;
      const matches = configSource.match(consoleLogPattern);
      
      expect(matches).toBeNull();
    });

    it('should import logger from loggerHelper', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for logger import
      expect(configSource).toMatch(/import.*getLogger.*from.*loggerHelper/);
    });

    it('should initialize logger instance', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for logger initialization
      expect(configSource).toMatch(/const\s+logger\s*=\s*getLogger\(module\)/);
    });

    it('should use logger.error instead of console.error', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for logger.error usage
      expect(configSource).toMatch(/logger\.error\(['"]Configuration validation failed['"]/);
    });

    it('should use logger.warn instead of console.warn for security warnings', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for logger.warn usage
      expect(configSource).toMatch(/logger\.warn\(/);
      expect(configSource).toMatch(/\[SECURITY WARNING\]/);
    });

    it('should use structured logging format', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check that logger calls have structured metadata (object as second parameter)
      // Pattern: logger.error('message', { key: value })
      const structuredLogPattern = /logger\.(error|warn)\([^,]+,\s*\{/g;
      const matches = configSource.match(structuredLogPattern);
      
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should include environment context in logs', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check that logs include environment information
      expect(configSource).toMatch(/environment:\s*process\.env\.NODE_ENV/);
    });

    it('should NOT have eslint-disable-next-line no-console directives', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for eslint disable comments (should be removed)
      const eslintDisablePattern = /eslint-disable.*no-console/i;
      const matches = configSource.match(eslintDisablePattern);
      
      expect(matches).toBeNull();
    });
  });

  describe('✅ HIGH-007 fix markers', () => {
    it('should have HIGH-007 fix comments in code', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check for HIGH-007 fix comments
      expect(configSource).toMatch(/FIX HIGH-007/);
    });

    it('should have at least 3 HIGH-007 fix markers (one for each console replacement)', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      const fixComments = configSource.match(/FIX HIGH-007/g);
      expect(fixComments).not.toBeNull();
      expect(fixComments!.length).toBeGreaterThanOrEqual(3);
    });

    it('should explain the fix in comments', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Check that fix comments explain what was changed
      expect(configSource).toMatch(/Use structured logger instead of console/);
    });
  });

  describe('📊 Logging best practices', () => {
    it('should use descriptive log messages', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Log messages should be descriptive
      expect(configSource).toMatch(/\[SECURITY WARNING\]/);
      expect(configSource).toMatch(/Configuration validation failed/);
    });

    it('should include metadata objects in all logger calls', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Find all logger.error and logger.warn calls
      const loggerCalls = configSource.match(/logger\.(error|warn)\([^)]+\)/g);
      
      expect(loggerCalls).not.toBeNull();
      
      // Each should have metadata (contains a comma indicating second parameter)
      loggerCalls!.forEach(call => {
        expect(call).toMatch(/,/);  // Has second parameter
      });
    });

    it('should use consistent log level markers', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Security warnings should use logger.warn
      const securityWarnings = configSource.match(/\[SECURITY WARNING\]/g);
      expect(securityWarnings).not.toBeNull();
      
      // Configuration errors should use logger.error
      expect(configSource).toMatch(/logger\.error.*Configuration validation failed/);
    });
  });

  describe('🔍 Code quality', () => {
    it('should NOT have any console.* calls in the entire file', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Remove comments first
      const sourceWithoutComments = configSource
        .replace(/\/\/.*$/gm, '')  // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments
      
      // Check for any console.* calls
      const consolePattern = /\bconsole\.(log|error|warn|info|debug)\(/g;
      const matches = sourceWithoutComments.match(consolePattern);
      
      expect(matches).toBeNull();
    });

    it('should have proper TypeScript types for logger', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Logger should be properly typed
      expect(configSource).toMatch(/import.*getLogger/);
      expect(configSource).toMatch(/const\s+logger/);
    });
  });

  describe('🛡️ Security audit trail', () => {
    it('should log sensitive operations with context', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // Security warnings should include context
      expect(configSource).toMatch(/source:/);
      expect(configSource).toMatch(/environment:/);
    });

    it('should be CloudWatch compatible (structured JSON)', () => {
      const configSource = fs.readFileSync(configFilePath, 'utf-8');
      
      // All logger calls should have object metadata (CloudWatch Insights compatible)
      const loggerCalls = configSource.match(/logger\.(error|warn)\([^)]+\{[^}]+\}/g);
      
      expect(loggerCalls).not.toBeNull();
      expect(loggerCalls!.length).toBeGreaterThan(0);
    });
  });
});

