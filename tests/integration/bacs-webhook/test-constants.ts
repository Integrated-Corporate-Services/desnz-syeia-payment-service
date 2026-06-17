/**
 * BACS Webhook Integration Test Constants
 * Centralized configuration for all BACS webhook tests
 */

/**
 * BACS webhook endpoint path
 * Change this in ONE place to update ALL tests
 */
export const WEBHOOK_ENDPOINT = '/webhooks/bacs/payments';

/**
 * Test signing secrets (from jest.setup.js)
 */
export const TEST_UKSBS_SIGNING_KEY = 'test-uksbs-signing-key-for-tests-12345678';
export const TEST_GOVPAY_SIGNING_KEY = 'test-govpay-signing-key-for-tests-12345678';

/**
 * Signature version
 */
export const SIGNATURE_VERSION = 'v1';

/**
 * Timestamp window (in minutes)
 */
export const TIMESTAMP_WINDOW_MINUTES = 5;
