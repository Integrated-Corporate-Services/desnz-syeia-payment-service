/**
 * Unit Tests for Config Logging - HIGH-007 Fix
 * Tests that configuration code does NOT use console.* methods
 * and properly uses structured logging with Winston logger
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Config Logging - HIGH-007 Fix', () => {
  const configFilePath = path.join(__dirname, '../../src/config/config.ts');
  let configSource: string;

  beforeAll(() => {
    // Read file once for all tests
    configSource = fs.readFileSync(configFilePath, 'utf-8');
  });

  describe('🔒 Source code compliance', () => {
    it('should NOT contain console.error() calls', () => {
      // Check for console.error (not in comments)
      const consoleErrorPattern = /^\s*console\.error\(/gm;
      const matches = configSource.match(consoleErrorPattern);
      
      if (matches) {
        fail(`Found ${matches.length} console.error() call(s): ${matches.join(', ')}`);
      }
      expect(matches).toBeNull();
    });

    it('should NOT contain console.warn() calls', () => {
      // Check for console.warn (not in comments)
      const consoleWarnPattern = /^\s*console\.warn\(/gm;
      const matches = configSource.match(consoleWarnPattern);
      
      if (matches) {
        fail(`Found ${matches.length} console.warn() call(s): ${matches.join(', ')}`);
      }
      expect(matches).toBeNull();
    });

    it('should NOT contain console.log() calls', () => {
      // Check for console.log (not in comments)
      const consoleLogPattern = /^\s*console\.log\(/gm;
      const matches = configSource.match(consoleLogPattern);
      
      if (matches) {
        fail(`Found ${matches.length} console.log() call(s): ${matches.join(', ')}`);
      }
      expect(matches).toBeNull();
    });

    it('should NOT contain console.info() or console.debug() calls', () => {
      const consoleInfoPattern = /^\s*console\.(info|debug)\(/gm;
      const matches = configSource.match(consoleInfoPattern);
      
      if (matches) {
        fail(`Found ${matches.length} console.info/debug() call(s): ${matches.join(', ')}`);
      }
      expect(matches).toBeNull();
    });

    it('should import logger from loggerHelper', () => {
      // Check for proper logger import
      expect(configSource).toMatch(/import\s+getLogger\s+from\s+['"]\.\.\/utils\/loggerHelper['"]/);
    });

    it('should initialize logger instance with module', () => {
      // Check for logger initialization with module parameter
      expect(configSource).toMatch(/const\s+logger\s*=\s*getLogger\(module\)/);
    });

    it('should use logger.error instead of console.error', () => {
      // Check for logger.error usage
      expect(configSource).toMatch(/logger\.error\(['"]Configuration validation failed['"]/);
    });

    it('should use logger.warn instead of console.warn for security warnings', () => {
      // Check for logger.warn usage with security warnings
      expect(configSource).toMatch(/logger\.warn\(/);
      expect(configSource).toMatch(/\[SECURITY WARNING\]/);
      
      // Should have at least 2 security warnings
      const securityWarnings = configSource.match(/\[SECURITY WARNING\]/g);
      expect(securityWarnings).not.toBeNull();
      expect(securityWarnings!.length).toBeGreaterThanOrEqual(2);
    });

    it('should use structured logging format', () => {
      // Check that logger calls have structured metadata (object as second parameter)
      // Pattern: logger.error('message', { key: value })
      const structuredLogPattern = /logger\.(error|warn)\([^,]+,\s*\{/g;
      const matches = configSource.match(structuredLogPattern);
      
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(3);
    });

    it('should include environment context in logs', () => {
      // Check that logs include environment information
      expect(configSource).toMatch(/environment:\s*process\.env\.NODE_ENV/);
      
      // Count occurrences - should be in all logger calls
      const envContextPattern = /environment:\s*process\.env\.NODE_ENV/g;
      const matches = configSource.match(envContextPattern);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(3);
    });

    it('should NOT have eslint-disable-next-line no-console directives', () => {
      // Check for eslint disable comments (should be removed)
      const eslintDisablePattern = /eslint-disable.*no-console/i;
      const matches = configSource.match(eslintDisablePattern);
      
      if (matches) {
        fail(`Found eslint-disable comment for console: ${matches.join(', ')}`);
      }
      expect(matches).toBeNull();
    });
  });

  describe('✅ HIGH-007 fix markers', () => {
    it('should have HIGH-007 fix comments in code', () => {
      // Check for HIGH-007 fix comments
      expect(configSource).toMatch(/FIX HIGH-007/);
    });

    it('should have exactly 3 HIGH-007 fix markers (one for each console replacement)', () => {
      const fixComments = configSource.match(/FIX HIGH-007/g);
      expect(fixComments).not.toBeNull();
      expect(fixComments!.length).toBe(3);
    });

    it('should explain the fix in comments', () => {
      // Check that fix comments explain what was changed
      expect(configSource).toMatch(/Use structured logger instead of console/);
      
      // Each HIGH-007 marker should have explanation
      const explanations = configSource.match(/Use structured logger instead of console\.(warn|error)/g);
      expect(explanations).not.toBeNull();
      expect(explanations!.length).toBeGreaterThanOrEqual(2);
    });

    it('should have fix markers before each logger call', () => {
      // Verify HIGH-007 comments appear before logger.warn and logger.error
      const lines = configSource.split('\n');
      let high007Lines: number[] = [];
      let loggerCallLines: number[] = [];
      
      lines.forEach((line, index) => {
        if (line.includes('FIX HIGH-007')) {
          high007Lines.push(index);
        }
        if (/^\s*logger\.(warn|error)\(/.test(line)) {
          loggerCallLines.push(index);
        }
      });
      
      // Each logger call should have a HIGH-007 marker within 5 lines before it
      loggerCallLines.forEach(loggerLine => {
        const hasMarkerBefore = high007Lines.some(markerLine => 
          loggerLine - markerLine > 0 && loggerLine - markerLine <= 5
        );
        expect(hasMarkerBefore).toBe(true);
      });
    });
  });

  describe('📊 Logging best practices', () => {
    it('should use descriptive log messages', () => {
      // Log messages should be descriptive
      expect(configSource).toMatch(/\[SECURITY WARNING\]/);
      expect(configSource).toMatch(/Configuration validation failed/);
    });

    it('should include metadata objects in all logger calls', () => {
      // Find all logger.error and logger.warn calls
      const loggerCallPattern = /logger\.(error|warn)\([^)]+\)/gs;
      const loggerCalls = configSource.match(loggerCallPattern);
      
      expect(loggerCalls).not.toBeNull();
      expect(loggerCalls!.length).toBeGreaterThanOrEqual(3);
      
      // Each should have metadata (contains a comma and object literal)
      loggerCalls!.forEach(call => {
        expect(call).toMatch(/,/);  // Has second parameter
        expect(call).toMatch(/\{/); // Has object literal
      });
    });

    it('should use consistent log level markers', () => {
      // Security warnings should use logger.warn
      const securityWarnings = configSource.match(/\[SECURITY WARNING\]/g);
      expect(securityWarnings).not.toBeNull();
      expect(securityWarnings!.length).toBeGreaterThanOrEqual(2);
      
      // Configuration errors should use logger.error
      expect(configSource).toMatch(/logger\.error.*Configuration validation failed/);
    });

    it('should include source field in security warnings', () => {
      // Security warnings should identify the source
      const sourcePattern = /logger\.warn\([^)]*source:/g;
      const matches = configSource.match(sourcePattern);
      
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(1);
    });

    it('should include error details in error logs', () => {
      // Error logs should include error message and stack
      expect(configSource).toMatch(/error:\s*error\s+instanceof\s+Error/);
      expect(configSource).toMatch(/stack:\s*error\s+instanceof\s+Error/);
    });
  });

  describe('🔍 Code quality', () => {
    it('should NOT have any console.* calls in the entire file', () => {
      // Remove comments first
      const sourceWithoutComments = configSource
        .replace(/\/\/.*$/gm, '')  // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments
      
      // Check for any console.* calls
      const consolePattern = /\bconsole\.(log|error|warn|info|debug)\(/g;
      const matches = sourceWithoutComments.match(consolePattern);
      
      if (matches) {
        fail(`Found ${matches.length} console.* call(s) in code: ${matches.join(', ')}`);
      }
      expect(matches).toBeNull();
    });

    it('should have proper TypeScript types for logger', () => {
      // Logger should be properly typed
      expect(configSource).toMatch(/import.*getLogger/);
      expect(configSource).toMatch(/const\s+logger/);
      
      // Should not have 'any' type annotation for logger
      expect(configSource).not.toMatch(/const\s+logger:\s*any/);
    });

    it('should use proper error handling with logger', () => {
      // Error handling should use try-catch with logger
      expect(configSource).toMatch(/try\s*\{[\s\S]*?catch\s*\([\s\S]*?logger\.error/);
    });
  });

  describe('🛡️ Security audit trail', () => {
    it('should log sensitive operations with context', () => {
      // Security warnings should include context
      expect(configSource).toMatch(/source:/);
      expect(configSource).toMatch(/environment:/);
      
      // Count context fields in security logs
      const contextPattern = /(source|environment|format|message):/g;
      const matches = configSource.match(contextPattern);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(6);
    });

    it('should be CloudWatch compatible (structured JSON)', () => {
      // All logger calls should have object metadata (CloudWatch Insights compatible)
      const loggerCallsWithMetadata = configSource.match(/logger\.(error|warn)\([^)]+\{[^}]+\}/g);
      
      expect(loggerCallsWithMetadata).not.toBeNull();
      expect(loggerCallsWithMetadata!.length).toBeGreaterThanOrEqual(3);
    });

    it('should provide actionable information in logs', () => {
      // Logs should have descriptive message fields
      const messagePattern = /message:\s*['"][^'"]+['"]/g;
      const messages = configSource.match(messagePattern);
      
      expect(messages).not.toBeNull();
      expect(messages!.length).toBeGreaterThanOrEqual(2);
    });

    it('should sanitize sensitive data in logs', () => {
      // Should NOT log passwords or credentials directly
      expect(configSource).not.toMatch(/logger\.(error|warn)\([^)]*password:\s*[^,}]+\)/);
      expect(configSource).not.toMatch(/logger\.(error|warn)\([^)]*credential:\s*[^,}]+\)/);
    });
  });
});

