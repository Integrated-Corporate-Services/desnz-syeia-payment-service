// Jest Setup - Runs before all tests
// Sets up test environment variables

process.env.NODE_ENV = 'test-dummy';
process.env.PORT = '3001';
process.env.HOST = 'localhost';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test-dummy';
process.env.DB_USER = 'test-dummy';
process.env.DB_PASSWORD = 'test-dummy';
process.env.PGSSLMODE = 'disable';

process.env.GOVPAY_WEBHOOK_SIGNING_KEY = 'test-dummy';  
process.env.GOVPAY_API_KEY = 'test-dummy';                      
process.env.GOVPAY_API_URL = 'test-dummy';               
process.env.UKSBS_WEBHOOK_SIGNING_KEY = 'test-dummy';    
process.env.BACKEND_SERVICE_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'error'; 
process.env.CALLBACK_SERVICE_ENABLED = 'true';
process.env.RETRY_ENABLED = 'true';
process.env.DLQ_ENABLED = 'true';

process.env.SIGNATURE_VERIFICATION_ENABLED = 'true';

process.env.AWS_REGION = 'eu-west-2';
process.env.AWS_ENDPOINT = 'http://localhost:4566'; 
process.env.AWS_ACCESS_KEY_ID = 'test-dummy';
process.env.AWS_SECRET_ACCESS_KEY = 'test-dummy';
process.env.PAYMENT_WEBHOOK_QUEUE_URL = 'http://localhost:4566/000000000000/payment-webhook-queue';
process.env.SQS_ENABLED = 'false'; 

