// Jest Setup - Runs before all tests
// Sets up test environment variables

process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.HOST = 'localhost';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.PGSSLMODE = 'disable';
// codeql[js/hardcoded-credentials] - Intentional test credentials
process.env.GOVPAY_WEBHOOK_SIGNING_KEY = 'test-govpay-signing-key-for-tests-12345678';  // ✅ Used in GovPay webhook validation
process.env.GOVPAY_API_KEY = 'test-govpay-api-key-not-real-value';                      // ✅ Used in GovPay API service
process.env.UKSBS_WEBHOOK_SIGNING_KEY = 'test-uksbs-signing-key-for-tests-12345678';    // ✅ Used in BACS webhook tests (47 tests)
process.env.BACKEND_SERVICE_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.CALLBACK_SERVICE_ENABLED = 'true';
process.env.RETRY_ENABLED = 'true';
process.env.DLQ_ENABLED = 'true';
// Enable signature verification in tests to ensure security features are validated
process.env.SIGNATURE_VERIFICATION_ENABLED = 'true';

// AWS Configuration (optional for tests)
process.env.AWS_REGION = 'eu-west-2';
process.env.AWS_ENDPOINT = 'http://localhost:4566'; // LocalStack endpoint for tests
process.env.AWS_ACCESS_KEY_ID = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
process.env.PAYMENT_WEBHOOK_QUEUE_URL = 'http://localhost:4566/000000000000/payment-webhook-queue';
process.env.SQS_ENABLED = 'false'; // Disable SQS in unit tests (mocked in SQS service tests)

