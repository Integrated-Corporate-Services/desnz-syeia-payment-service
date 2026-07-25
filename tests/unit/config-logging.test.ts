/**
 * Unit Tests for Config Logging - HIGH-007 Fix
 * Tests that configuration code does NOT use console.* methods
 * and properly uses structured logging with Winston logger
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Config Logging - HIGH-007 Fix', () => {
  // ✅ IMPROVED: Robust path resolution following industry standards
  // Uses fallback strategy instead of string matching for better reliability
  const findConfigFilePath = (): string => {
    const possiblePaths = [
      // Strategy 1: Relative from test file location (local development)
      path.join(__dirname, '../../src/config/config.ts'),
      
      // Strategy 2: Relative from compiled test location (CI/CD)
      path.join(__dirname, '../../../src/config/config.ts'),
      
      // Strategy 3: From process.cwd() (npm test execution context)
      path.join(process.cwd(), 'src/config/config.ts'),
      
      // Strategy 4: Absolute path resolution from __dirname
      path.resolve(__dirname, '../../src/config/config.ts'),
    ];
    
    // Find the first path that exists (fail-fast approach)
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    
    // Provide detailed error for debugging
    throw new Error(
      `❌ Config file not found. Searched paths:\n${possiblePaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n` +
      `\nDebug Info:\n` +
      `  - __dirname: ${__dirname}\n` +
      `  - process.cwd(): ${process.cwd()}\n` +
      `  - NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`
    );
  };
  
  // Test constants following DRY principle
  const CONFIG_FILE_PATH = findConfigFilePath();
  const MIN_SECURITY_WARNINGS = 2;
  const MIN_LOGGER_CALLS = 3;
  const EXPECTED_HIGH_007_MARKERS = 3;
  const MAX_LINES_BETWEEN_MARKER_AND_CALL = 5;
  
  let configSource: string;

  beforeAll(() => {
    // Arrange: Read file once for all tests (performance optimization)
    try {
      configSource = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read config file at ${CONFIG_FILE_PATH}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // ============================================
  // HELPER FUNCTIONS (Following DRY & SOLID principles)
  // ============================================

  /**
   * Assert that a pattern does NOT appear in the source code
   * @param pattern - Regex pattern to search for
   * @param errorMessage - Error message prefix
   */
  const assertNoMatches = (pattern: RegExp, errorMessage: string): void => {
    const matches = configSource.match(pattern);
    if (matches) {
      fail(`${errorMessage}: Found ${matches.length} occurrence(s)\n  - ${matches.join('\n  - ')}`);
    }
    expect(matches).toBeNull();
  };

  /**
   * Assert that a pattern DOES appear in the source code
   * @param pattern - Regex pattern to search for
   * @param errorMessage - Error message if not found
   * @param minCount - Minimum expected occurrences
   */
  const assertHasMatches = (pattern: RegExp, errorMessage: string, minCount: number = 1): RegExpMatchArray => {
    const matches = configSource.match(pattern);
    expect(matches).not.toBeNull();
    if (!matches || matches.length < minCount) {
      fail(`${errorMessage}: Expected at least ${minCount}, found ${matches?.length || 0}`);
    }
    expect(matches.length).toBeGreaterThanOrEqual(minCount);
    return matches;
  };

  /**
   * Remove all comments from source code for accurate pattern matching
   * @param source - Source code to process
   */
  const removeComments = (source: string): string => {
    return source
      .replace(/\/\/.*$/gm, '')  // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments
  };

  // ============================================
  // TEST SUITES
  // ============================================

  describe('🔒 Source code compliance', () => {
    // AAA Pattern: Arrange-Act-Assert
    it('should NOT contain console.error() calls', () => {
      // Arrange: Define pattern to search for
      const consoleErrorPattern = /^\s*console\.error\(/gm;
      
      // Act & Assert: Verify no console.error() exists
      assertNoMatches(consoleErrorPattern, 'Console.error() calls found');
    });

    it('should NOT contain console.warn() calls', () => {
      const consoleWarnPattern = /^\s*console\.warn\(/gm;
      assertNoMatches(consoleWarnPattern, 'Console.warn() calls found');
    });

    it('should NOT contain console.log() calls', () => {
      const consoleLogPattern = /^\s*console\.log\(/gm;
      assertNoMatches(consoleLogPattern, 'Console.log() calls found');
    });

    it('should NOT contain console.info() or console.debug() calls', () => {
      const consoleInfoPattern = /^\s*console\.(info|debug)\(/gm;
      assertNoMatches(consoleInfoPattern, 'Console.info() or console.debug() calls found');
    });

    it('should import logger from loggerHelper', () => {
      const loggerImportPattern = /import\s+getLogger\s+from\s+['"]\.\.\/utils\/loggerHelper['"]/;
      assertHasMatches(loggerImportPattern, 'Logger import not found');
    });

    it('should initialize logger instance with module', () => {
      const loggerInitPattern = /const\s+logger\s*=\s*getLogger\(module\)/;
      assertHasMatches(loggerInitPattern, 'Logger initialization with module not found');
    });

    it('should use logger.error instead of console.error', () => {
      const loggerErrorPattern = /logger\.error\(['"]Configuration validation failed['"]/;
      assertHasMatches(loggerErrorPattern, 'logger.error for configuration validation not found');
    });

    it('should use logger.warn instead of console.warn for security warnings', () => {
      // Assert: Verify logger.warn is used
      assertHasMatches(/logger\.warn\(/, 'logger.warn not found');
      assertHasMatches(/\[SECURITY WARNING\]/, 'Security warning marker not found');
      
      // Assert: Verify minimum security warnings exist
      const securityWarnings = assertHasMatches(
        /\[SECURITY WARNING\]/g,
        'Insufficient security warnings',
        MIN_SECURITY_WARNINGS
      );
      expect(securityWarnings.length).toBeGreaterThanOrEqual(MIN_SECURITY_WARNINGS);
    });

    it('should use structured logging format', () => {
      // Arrange: Pattern for structured logging (logger.error/warn with object parameter)
      const structuredLogPattern = /logger\.(error|warn)\([^,]+,\s*\{/g;
      
      // Assert: Verify structured logging is used
      const matches = assertHasMatches(
        structuredLogPattern,
        'Structured logging format not found',
        MIN_LOGGER_CALLS
      );
      expect(matches.length).toBeGreaterThanOrEqual(MIN_LOGGER_CALLS);
    });

    it('should include environment context in logs', () => {
      // Assert: Verify environment context exists
      const envContextPattern = /environment:\s*process\.env\.NODE_ENV/g;
      const matches = assertHasMatches(
        envContextPattern,
        'Environment context in logs not found',
        MIN_LOGGER_CALLS
      );
      expect(matches.length).toBeGreaterThanOrEqual(MIN_LOGGER_CALLS);
    });

    it('should NOT have eslint-disable-next-line no-console directives', () => {
      const eslintDisablePattern = /eslint-disable.*no-console/i;
      assertNoMatches(eslintDisablePattern, 'ESLint disable directive for console found');
    });
  });

  describe('✅ HIGH-007 fix markers', () => {
    it('should have HIGH-007 fix comments in code', () => {
      assertHasMatches(/FIX HIGH-007/, 'HIGH-007 fix markers not found');
    });

    it('should have exactly 3 HIGH-007 fix markers (one for each console replacement)', () => {
      const fixComments = assertHasMatches(
        /FIX HIGH-007/g,
        'HIGH-007 fix markers not found',
        EXPECTED_HIGH_007_MARKERS
      );
      expect(fixComments.length).toBe(EXPECTED_HIGH_007_MARKERS);
    });

    it('should explain the fix in comments', () => {
      assertHasMatches(/Use structured logger instead of console/, 'Fix explanation not found');
      
      // Verify explanations mention specific console methods replaced
      const explanations = assertHasMatches(
        /Use structured logger instead of console\.(warn|error)/g,
        'Detailed fix explanations not found',
        MIN_SECURITY_WARNINGS
      );
      expect(explanations.length).toBeGreaterThanOrEqual(MIN_SECURITY_WARNINGS);
    });

    it('should have fix markers before each logger call', () => {
      // Arrange: Parse source into lines
      const lines = configSource.split('\n');
      const high007Lines: number[] = [];
      const loggerCallLines: number[] = [];
      
      // Act: Find all HIGH-007 markers and logger calls
      lines.forEach((line, index) => {
        if (line.includes('FIX HIGH-007')) {
          high007Lines.push(index);
        }
        if (/^\s*logger\.(warn|error)\(/.test(line)) {
          loggerCallLines.push(index);
        }
      });
      
      // Assert: Each logger call should have a marker within specified lines before it
      loggerCallLines.forEach(loggerLine => {
        const hasMarkerBefore = high007Lines.some(markerLine => 
          loggerLine - markerLine > 0 && 
          loggerLine - markerLine <= MAX_LINES_BETWEEN_MARKER_AND_CALL
        );
        expect(hasMarkerBefore).toBe(true);
      });
    });
  });

  describe('📊 Logging best practices', () => {
    it('should use descriptive log messages', () => {
      assertHasMatches(/\[SECURITY WARNING\]/, 'Security warning markers not found');
      assertHasMatches(/Configuration validation failed/, 'Configuration validation message not found');
    });

    it('should include metadata objects in all logger calls', () => {
      // Arrange: Pattern to find logger calls
      const loggerCallPattern = /logger\.(error|warn)\([^)]+\)/gs;
      const loggerCalls = assertHasMatches(
        loggerCallPattern,
        'Logger calls not found',
        MIN_LOGGER_CALLS
      );
      
      // Assert: Each call should have metadata (comma and object literal)
      loggerCalls.forEach(call => {
        expect(call).toMatch(/,/);  // Has second parameter
        expect(call).toMatch(/\{/); // Has object literal
      });
    });

    it('should use consistent log level markers', () => {
      // Assert: Security warnings use logger.warn
      const securityWarnings = assertHasMatches(
        /\[SECURITY WARNING\]/g,
        'Security warnings not found',
        MIN_SECURITY_WARNINGS
      );
      expect(securityWarnings.length).toBeGreaterThanOrEqual(MIN_SECURITY_WARNINGS);
      
      // Assert: Configuration errors use logger.error
      assertHasMatches(/logger\.error.*Configuration validation failed/, 'Configuration error logging not found');
    });

    it('should include source field in security warnings', () => {
      const sourcePattern = /logger\.warn\([^)]*source:/g;
      assertHasMatches(sourcePattern, 'Source field in security warnings not found');
    });

    it('should include error details in error logs', () => {
      assertHasMatches(/error:\s*error\s+instanceof\s+Error/, 'Error message extraction not found');
      assertHasMatches(/stack:\s*error\s+instanceof\s+Error/, 'Error stack extraction not found');
    });
  });

  describe('🔍 Code quality', () => {
    it('should NOT have any console.* calls in the entire file', () => {
      // Arrange: Remove comments for accurate detection
      const sourceWithoutComments = removeComments(configSource);
      
      // Act: Check for any console.* calls
      const consolePattern = /\bconsole\.(log|error|warn|info|debug)\(/g;
      
      // Assert: No console calls should exist
      const matches = sourceWithoutComments.match(consolePattern);
      if (matches) {
        fail(`Console.* calls found in code (excluding comments): ${matches.length} occurrence(s)\n  - ${matches.join('\n  - ')}`);
      }
      expect(matches).toBeNull();
    });

    it('should have proper TypeScript types for logger', () => {
      assertHasMatches(/import.*getLogger/, 'Logger import not found');
      assertHasMatches(/const\s+logger/, 'Logger constant not found');
      
      // Assert: Logger should not have 'any' type annotation
      assertNoMatches(/const\s+logger:\s*any/, 'Logger uses "any" type (should be properly typed)');
    });

    it('should use proper error handling with logger', () => {
      // Assert: try-catch blocks should use logger.error
      assertHasMatches(
        /try\s*\{[\s\S]*?catch\s*\([\s\S]*?logger\.error/,
        'Error handling with logger not found'
      );
    });
  });

  describe('🛡️ Security audit trail', () => {
    it('should log sensitive operations with context', () => {
      assertHasMatches(/source:/, 'Source context field not found');
      assertHasMatches(/environment:/, 'Environment context field not found');
      
      // Arrange: Define context fields pattern
      const contextPattern = /(source|environment|format|message):/g;
      
      // Assert: Verify sufficient context fields exist
      const matches = assertHasMatches(
        contextPattern,
        'Insufficient context fields in logs',
        6
      );
      expect(matches.length).toBeGreaterThanOrEqual(6);
    });

    it('should be CloudWatch compatible (structured JSON)', () => {
      // Arrange: Pattern for structured logging with metadata
      const loggerCallsWithMetadata = /logger\.(error|warn)\([^)]+\{[^}]+\}/g;
      
      // Assert: All logger calls should have structured metadata
      const matches = assertHasMatches(
        loggerCallsWithMetadata,
        'Logger calls without structured metadata found',
        MIN_LOGGER_CALLS
      );
      expect(matches.length).toBeGreaterThanOrEqual(MIN_LOGGER_CALLS);
    });

    it('should provide actionable information in logs', () => {
      // Arrange: Pattern for descriptive message fields
      const messagePattern = /message:\s*['"][^'"]+['"]/g;
      
      // Assert: Logs should have descriptive messages
      const messages = assertHasMatches(
        messagePattern,
        'Descriptive message fields not found',
        MIN_SECURITY_WARNINGS
      );
      expect(messages.length).toBeGreaterThanOrEqual(MIN_SECURITY_WARNINGS);
    });

    it('should sanitize sensitive data in logs', () => {
      // Assert: Should NOT log passwords or credentials directly
      assertNoMatches(
        /logger\.(error|warn)\([^)]*password:\s*[^,}]+\)/,
        'Potential password leakage in logs detected'
      );
      assertNoMatches(
        /logger\.(error|warn)\([^)]*credential:\s*[^,}]+\)/,
        'Potential credential leakage in logs detected'
      );
    });
  });
});

