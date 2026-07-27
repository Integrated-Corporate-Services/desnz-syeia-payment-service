/**
 * Unit Tests for Error Sanitization Utility
 * Tests security vulnerability fixes for HIGH-003: Information Disclosure
 */

import {
  sanitizeErrorMessage,
  isDatabaseError,
  sanitizeForEnvironment,
  sanitizeForClient,
  createSanitizedErrorLog,
} from '../../src/utils/errorSanitizer';

describe('errorSanitizer', () => {
  describe('sanitizeErrorMessage', () => {
    it('should redact table names from PostgreSQL errors', () => {
      const error = new Error('duplicate key value violates unique constraint on table "payment_webhooks"');
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('payment_webhooks');
    });

    it('should redact column names from database errors', () => {
      const error = 'column "secret_key" does not exist';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('secret_key');
    });

    it('should redact connection strings', () => {
      const error = 'connection failed: host=prod-db-001.internal password=secret123';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('host=[REDACTED]');
      expect(result).toContain('password=[REDACTED]');
      expect(result).not.toContain('prod-db-001');
      expect(result).not.toContain('secret123');
    });

    it('should redact PostgreSQL connection URIs', () => {
      const error = 'failed to connect to postgres://user:pass@db.internal:5432/payments';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('postgres://[REDACTED]');
      expect(result).not.toContain('user:pass');
      expect(result).not.toContain('db.internal');
    });

    it('should redact file paths', () => {
      const error = new Error('File not found: /home/ubuntu/app/secrets.env');
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('/[REDACTED]');
      expect(result).not.toContain('/home/ubuntu/app');
    });

    it('should redact IP addresses', () => {
      const error = 'Connection refused from 192.168.1.100';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('[IP_REDACTED]');
      expect(result).not.toContain('192.168.1.100');
    });

    it('should redact UUIDs to prevent correlation attacks', () => {
      const error = 'Payment 550e8400-e29b-41d4-a716-446655440000 not found';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('[UUID_REDACTED]');
      expect(result).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should preserve error type when preserveType is true', () => {
      const error = new Error('Database connection failed');
      const result = sanitizeErrorMessage(error, { preserveType: true });
      
      expect(result).toContain('Error:');
    });

    it('should truncate extremely long error messages (DoS protection)', () => {
      const longError = 'Error: ' + 'A'.repeat(1000);
      const result = sanitizeErrorMessage(longError, { maxLength: 200 });
      
      expect(result.length).toBeLessThanOrEqual(215); // 200 + '...[TRUNC]' (10 chars)
      expect(result).toContain('[TRUNC]');
    });

    it('should handle non-Error objects safely', () => {
      const result1 = sanitizeErrorMessage('plain string error');
      const result2 = sanitizeErrorMessage({ message: 'object error' });
      const result3 = sanitizeErrorMessage(null);
      
      expect(result1).toBe('plain string error');
      expect(result2).toContain('object error');
      expect(result3).toBe('null');
    });

    it('should redact multiple sensitive patterns in one message', () => {
      const error = 'Error in table "users" on host=prod-db password=secret at /var/app/db.ts';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('users');
      expect(result).not.toContain('prod-db');
      expect(result).not.toContain('secret');
      expect(result).not.toContain('/var/app/db.ts');
    });
  });

  describe('isDatabaseError', () => {
    it('should detect PostgreSQL constraint errors', () => {
      const errors = [
        'duplicate key value violates unique constraint',
        'foreign key constraint violation',
        'check constraint failed',
        'not-null constraint violation',
      ];
      
      errors.forEach(error => {
        expect(isDatabaseError(error)).toBe(true);
      });
    });

    it('should detect PostgreSQL relation errors', () => {
      expect(isDatabaseError('relation "table_name" does not exist')).toBe(true);
      expect(isDatabaseError('column "col" does not exist')).toBe(true);
    });

    it('should detect connection errors', () => {
      expect(isDatabaseError('connection refused')).toBe(true);
      expect(isDatabaseError('timeout expired')).toBe(true);
      expect(isDatabaseError('permission denied')).toBe(true);
    });

    it('should not detect non-database errors', () => {
      const nonDbErrors = [
        'Invalid request',
        'Unauthorized',
        'Network error',
        'File not found',
      ];
      
      nonDbErrors.forEach(error => {
        expect(isDatabaseError(error)).toBe(false);
      });
    });
  });

  describe('sanitizeForEnvironment', () => {
    it('should be more restrictive in production', () => {
      const error = new Error('database table "payments" constraint violation');
      
      const prodResult = sanitizeForEnvironment(error, 'production');
      const devResult = sanitizeForEnvironment(error, 'development');
      
      expect(prodResult).toBe('Database operation failed');
      expect(devResult).toContain('table "[REDACTED]"');
    });

    it('should allow more details in non-production environments', () => {
      const error = new Error('Connection failed to database "test_db"');
      
      const result = sanitizeForEnvironment(error, 'development');
      
      // Should have sanitized version but with more details
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(20);
    });

    it('should handle prod/production environment strings', () => {
      const error = new Error('duplicate key');
      
      const result1 = sanitizeForEnvironment(error, 'prod');
      const result2 = sanitizeForEnvironment(error, 'production');
      
      expect(result1).toBe('Database operation failed');
      expect(result2).toBe('Database operation failed');
    });
  });

  describe('sanitizeForClient', () => {
    it('should never expose database errors to clients', () => {
      const dbError = new Error('table "secret_payments" does not exist');
      const result = sanitizeForClient(dbError);
      
      expect(result).toBe('A system error occurred. Please try again later.');
      expect(result).not.toContain('table');
      expect(result).not.toContain('secret_payments');
    });

    it('should return generic message for all errors', () => {
      const error = new Error('Internal application error with details');
      const result = sanitizeForClient(error);
      
      expect(result).toBe('An error occurred processing your request.');
    });
  });

  describe('createSanitizedErrorLog', () => {
    it('should create structured log object', () => {
      const error = new Error('Connection to table "users" failed');
      const result = createSanitizedErrorLog(error);
      
      expect(result).toHaveProperty('sanitized_message');
      expect(result).toHaveProperty('error_type');
      expect(result).toHaveProperty('is_database_error');
      expect(result).toHaveProperty('safe_for_client');
      
      expect(result.sanitized_message).toContain('[REDACTED]');
      expect(result.error_type).toBe('Error');
      expect(result.is_database_error).toBe(true);
      expect(result.safe_for_client).toBe(false);
    });

    it('should identify non-database errors correctly', () => {
      const error = new TypeError('Invalid argument');
      const result = createSanitizedErrorLog(error);
      
      expect(result.error_type).toBe('TypeError');
      expect(result.is_database_error).toBe(false);
    });

    it('should handle string errors', () => {
      const result = createSanitizedErrorLog('Simple error message');
      
      expect(result.error_type).toBe('string');
      expect(result.sanitized_message).toBe('Simple error message');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle SQL injection attempts in error messages', () => {
      const error = "table \"users; DROP TABLE payments; --\" not found";
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('DROP TABLE');
    });

    it('should handle XSS attempts in error messages', () => {
      const error = 'Error in column "<script>alert(1)</script>"';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('<script>');
    });

    it('should handle path traversal in error messages', () => {
      const error = 'File not found: /../../etc/passwd';
      const result = sanitizeErrorMessage(error);
      
      expect(result).toContain('/[REDACTED]');
      expect(result).not.toContain('etc/passwd');
    });

    it('should handle extremely malicious composite payloads', () => {
      const error = 'table "users" at host=192.168.1.1 password=admin123 file=/etc/shadow';
      const result = sanitizeErrorMessage(error);
      
      // All sensitive info should be redacted
      expect(result).not.toContain('users');
      expect(result).not.toContain('192.168.1.1');
      expect(result).not.toContain('admin123');
      expect(result).not.toContain('/etc/shadow');
      expect(result).toContain('[REDACTED]');
    });
  });
});
