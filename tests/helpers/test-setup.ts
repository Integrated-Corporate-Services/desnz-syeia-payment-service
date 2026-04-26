/**
 * ===================================================================
 * Test Setup Helpers
 * ===================================================================
 * Common test setup utilities and helper functions
 * Reduces boilerplate in test files
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';

/**
 * Create a mock Express Request object
 */
export function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  const mockGet = jest.fn((header: string) => {
    const headers = (overrides.headers || {}) as Record<string, string>;
    return headers[header.toLowerCase()];
  }) as any; // Type assertion to avoid Express type complexity

  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    get: mockGet,
    ...overrides,
  };
}

/**
 * Create a mock Express Response object
 */
export function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Create a mock NextFunction
 */
export function createMockNext(): jest.Mock {
  return jest.fn();
}

/**
 * Create a mock PostgreSQL Pool
 */
export function createMockPool(): jest.Mocked<Pool> {
  return {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  } as any;
}

/**
 * Create a mock database query result
 */
export function createMockQueryResult<T>(rows: T[] = [], rowCount?: number) {
  return {
    rows,
    rowCount: rowCount !== undefined ? rowCount : rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

/**
 * Mock logger
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Wait for a condition to be true (polling utility)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await sleep(interval);
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Sleep utility for async tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture console output during test execution
 */
export class ConsoleCapture {
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
  };
  public logs: string[] = [];
  public errors: string[] = [];
  public warnings: string[] = [];

  constructor() {
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
    };
  }

  start(): void {
    console.log = (...args: any[]) => {
      this.logs.push(args.join(' '));
    };
    console.error = (...args: any[]) => {
      this.errors.push(args.join(' '));
    };
    console.warn = (...args: any[]) => {
      this.warnings.push(args.join(' '));
    };
  }

  stop(): void {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
  }

  clear(): void {
    this.logs = [];
    this.errors = [];
    this.warnings = [];
  }
}

/**
 * Test lifecycle hooks
 */
export class TestLifecycle {
  static setupBeforeEach(): void {
    // Clear all mocks before each test
    jest.clearAllMocks();
  }

  static setupAfterEach(): void {
    // Restore all mocks after each test
    jest.restoreAllMocks();
  }

  static setupBeforeAll(): void {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
  }

  static setupAfterAll(): void {
    // Clean up test environment
    jest.clearAllTimers();
  }
}

/**
 * Assertion helpers
 */
export class TestAssertions {
  /**
   * Assert that a function was called with specific arguments
   */
  static assertCalledWith<T>(
    mockFn: jest.Mock,
    ...expectedArgs: any[]
  ): void {
    expect(mockFn).toHaveBeenCalledWith(...expectedArgs);
  }

  /**
   * Assert that a function was called exactly N times
   */
  static assertCalledTimes(mockFn: jest.Mock, times: number): void {
    expect(mockFn).toHaveBeenCalledTimes(times);
  }

  /**
   * Assert that a function was not called
   */
  static assertNotCalled(mockFn: jest.Mock): void {
    expect(mockFn).not.toHaveBeenCalled();
  }

  /**
   * Assert that response has specific status code
   */
  static assertResponseStatus(
    res: Partial<Response>,
    expectedStatus: number
  ): void {
    expect(res.status).toHaveBeenCalledWith(expectedStatus);
  }

  /**
   * Assert that response has specific JSON body
   */
  static assertResponseJson(
    res: Partial<Response>,
    expectedJson: any
  ): void {
    expect(res.json).toHaveBeenCalledWith(expectedJson);
  }
}

/**
 * Database test helpers
 */
export class DatabaseTestHelpers {
  /**
   * Mock a successful database query
   */
  static mockSuccessfulQuery<T>(pool: jest.Mocked<Pool>, rows: T[]): void {
    (pool.query as jest.Mock).mockResolvedValueOnce(createMockQueryResult(rows));
  }

  /**
   * Mock a failed database query
   */
  static mockFailedQuery(pool: jest.Mocked<Pool>, error: Error): void {
    (pool.query as jest.Mock).mockRejectedValueOnce(error);
  }

  /**
   * Mock an empty result set
   */
  static mockEmptyResult(pool: jest.Mocked<Pool>): void {
    (pool.query as jest.Mock).mockResolvedValueOnce(createMockQueryResult([]));
  }

  /**
   * Verify query was called with specific SQL
   */
  static assertQueryCalledWith(
    pool: jest.Mocked<Pool>,
    expectedSql: string,
    expectedParams?: any[]
  ): void {
    if (expectedParams) {
      expect(pool.query).toHaveBeenCalledWith(expectedSql, expectedParams);
    } else {
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining(expectedSql.trim().substring(0, 50))
      );
    }
  }
}
