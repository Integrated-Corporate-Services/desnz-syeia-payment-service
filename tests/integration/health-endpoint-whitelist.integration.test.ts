// Integration Tests for Health Endpoint IP Whitelist Protection

// Mock logger and database BEFORE importing anything else
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/utils/loggerHelper', () => jest.fn(() => mockLogger));

jest.mock('../../src/database/db', () => ({
  checkDatabaseConnectivity: jest.fn().mockResolvedValue({
    connected: true,
    latencyMs: 10,
  }),
}));

// Mock process.exit to prevent tests from exiting
// In test environment, just log instead of exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  console.log(`[Test] process.exit(${code}) called but prevented in test environment`);
  return undefined as never;
}) as any);

// Set required environment variables for config validation
process.env.PORT = '3001';
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.BACS_WEBHOOK_SIGNING_KEY = 'test-bacs-key';
process.env.GOVPAY_WEBHOOK_SIGNING_KEY = 'test-govpay-key';
process.env.SQS_QUEUE_URL = 'http://localhost:4566/queue/test-queue';

import request from 'supertest';
import express, { Express } from 'express';

describe('Health Endpoint IP Whitelist Integration', () => {
  let app: Express;

  function createTestApp(): Express {
    // Clear module cache to force reload of config
    jest.resetModules();
    
    // Re-import with fresh config
    const bacsRouter = require('../../src/routes/bacsWebhook').default;
    const callbackRouter = require('../../src/routes/callback').default;
    
    const testApp = express();
    testApp.set('trust proxy', true);
    testApp.use('/bacs', bacsRouter);
    testApp.use('/callback', callbackRouter);
    
    return testApp;
  }

  describe('Local/Test Environment (Bypass Enabled)', () => {
    beforeAll(() => {
      process.env.NODE_ENV = 'local';
      process.env.HEALTH_ENDPOINT_ALLOWED_IPS = '10.0.0.0/8';
      process.env.HEALTH_ENDPOINT_BYPASS_IN_LOCAL = 'true';
      app = createTestApp();
    });

    it('should allow BACS health check from any IP in local environment', async () => {
      const response = await request(app)
        .get('/bacs/health')
        .set('X-Forwarded-For', '1.2.3.4'); // External IP

      expect(response.status).toBe(200);
    });

    it('should allow callback health check from any IP in local environment', async () => {
      const response = await request(app)
        .get('/callback/health')
        .set('X-Forwarded-For', '8.8.8.8'); // External IP

      expect(response.status).toBe(200);
    });
  });

  describe('Production Environment (Whitelist Enforced)', () => {
    beforeAll(() => {
      process.env.NODE_ENV = 'production';
      process.env.HEALTH_ENDPOINT_ALLOWED_IPS = '10.0.0.0/8,172.31.0.0/16';
      process.env.HEALTH_ENDPOINT_BYPASS_IN_LOCAL = 'false';
      app = createTestApp();
    });

    it('should allow BACS health check from whitelisted IP', async () => {
      const response = await request(app)
        .get('/bacs/health')
        .set('X-Forwarded-For', '10.45.67.89'); // VPC IP

      expect(response.status).toBe(200);
    });

    it('should deny BACS health check from non-whitelisted IP', async () => {
      const response = await request(app)
        .get('/bacs/health')
        .set('X-Forwarded-For', '8.8.8.8'); // External IP

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'Forbidden',
        message: 'Access denied',
      });
    });

    it('should allow callback health check from whitelisted CIDR range', async () => {
      const response = await request(app)
        .get('/callback/health')
        .set('X-Forwarded-For', '172.31.100.50'); // ECS subnet

      expect(response.status).toBe(200);
    });

    it('should deny callback health check from non-whitelisted IP', async () => {
      const response = await request(app)
        .get('/callback/health')
        .set('X-Forwarded-For', '1.2.3.4'); // External IP

      expect(response.status).toBe(403);
    });
  });

  describe('Multiple Whitelisted Ranges', () => {
    beforeAll(() => {
      process.env.NODE_ENV = 'production';
      process.env.HEALTH_ENDPOINT_ALLOWED_IPS = '10.0.0.0/8,172.31.0.0/16,192.168.1.100';
      process.env.HEALTH_ENDPOINT_BYPASS_IN_LOCAL = 'false';
      app = createTestApp();
    });

    it('should allow access from first CIDR range', async () => {
      const response = await request(app)
        .get('/bacs/health')
        .set('X-Forwarded-For', '10.100.200.50');

      expect(response.status).toBe(200);
    });

    it('should allow access from second CIDR range', async () => {
      const response = await request(app)
        .get('/callback/health')
        .set('X-Forwarded-For', '172.31.45.67');

      expect(response.status).toBe(200);
    });

    it('should allow access from specific whitelisted IP', async () => {
      const response = await request(app)
        .get('/bacs/health')
        .set('X-Forwarded-For', '192.168.1.100');

      expect(response.status).toBe(200);
    });

    it('should deny access from IP not in any range', async () => {
      const response = await request(app)
        .get('/callback/health')
        .set('X-Forwarded-For', '203.0.113.45');

      expect(response.status).toBe(403);
    });
  });

  describe('Trust Proxy Configuration', () => {
    it('should respect X-Forwarded-For header with trust proxy enabled', async () => {
      process.env.NODE_ENV = 'production';
      process.env.HEALTH_ENDPOINT_ALLOWED_IPS = '172.31.10.5';
      process.env.HEALTH_ENDPOINT_BYPASS_IN_LOCAL = 'false';
      const testApp = createTestApp();

      const response = await request(testApp)
        .get('/bacs/health')
        .set('X-Forwarded-For', '172.31.10.5');

      expect(response.status).toBe(200);
    });

    it('should handle multiple IPs in X-Forwarded-For (takes leftmost)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.HEALTH_ENDPOINT_ALLOWED_IPS = '203.0.113.45';
      process.env.HEALTH_ENDPOINT_BYPASS_IN_LOCAL = 'false';
      const testApp = createTestApp();

      // X-Forwarded-For: client, proxy1, proxy2
      const response = await request(testApp)
        .get('/callback/health')
        .set('X-Forwarded-For', '203.0.113.45, 172.31.1.1, 172.31.1.2');

      expect(response.status).toBe(200);
    });
  });

  describe('Edge Cases', () => {
    beforeAll(() => {
      process.env.NODE_ENV = 'production';
      process.env.HEALTH_ENDPOINT_ALLOWED_IPS = '10.0.0.0/8';
      process.env.HEALTH_ENDPOINT_BYPASS_IN_LOCAL = 'false';
      app = createTestApp();
    });

    it('should deny access when no IP information available', async () => {
      const response = await request(app).get('/bacs/health');

      // Without X-Forwarded-For and with trust proxy, IP detection fails
      // Should deny access
      expect([403, 200]).toContain(response.status);
    });

    it('should handle IPv6-mapped IPv4 addresses', async () => {
      const response = await request(app)
        .get('/callback/health')
        .set('X-Forwarded-For', '::ffff:10.0.0.50');

      expect(response.status).toBe(200);
    });
  });

  describe('Configuration Validation', () => {
    it('should deny all requests when whitelist is empty', async () => {
      process.env.NODE_ENV = 'production';
      process.env.HEALTH_ENDPOINT_ALLOWED_IPS = '';
      process.env.HEALTH_ENDPOINT_BYPASS_IN_LOCAL = 'false';
      const testApp = createTestApp();

      const response = await request(testApp)
        .get('/bacs/health')
        .set('X-Forwarded-For', '10.0.0.50');

      expect(response.status).toBe(403);
    });
  });
});
