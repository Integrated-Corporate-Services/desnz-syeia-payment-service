# Inbound Event Receiver

Dedicated microservice for handling webhook integrations from GOV.UK Pay and GOV.UK Notify for DESNZ-SYEIA application system.

## 📋 Overview

This service provides:
- **Webhook reception** from GOV.UK Pay payment callbacks
- **Signature verification** for webhook authenticity
- **Deduplication** to prevent duplicate payment processing
- **Retry mechanism** with exponential backoff for transient failures
- **Dead-letter queue** for permanently failed webhooks
- **SQS integration** for async Lambda processing
- **PostgreSQL storage** for audit trail and retry management

## 🏗️ Architecture

```
GOV.UK Pay → [Webhook] → Inbound Receiver → [SQS] → Lambda Processor
                             ↓
                        PostgreSQL
                     (Audit & Retry)
```

### Components

- **Express.js HTTP Server**: Receives webhook POST requests
- **PostgreSQL Database**: Stores webhook history and manages retries
- **SQS Queue**: Delegates processing to Lambda functions
- **Signature Validator**: HMAC-SHA256 verification of webhook authenticity

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **PostgreSQL** 12+
- **AWS Account** (for SQS, optional in local development)
- **npm** or **yarn** package manager

### Installation

1. **Clone the repository**
   ```bash
   cd inbound-event-receiver
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your actual configuration values
   ```

4. **Set up database**
   ```bash
   # Create database
   createdb appdb
   
   # Run migration
   psql -h localhost -U postgres appdb < src/database/001_create_payment_webhooks.sql
   ```

5. **Build TypeScript**
   ```bash
   npm run build
   ```

6. **Start the service**
   ```bash
   # Development mode (with auto-reload)
   npm run dev
   
   # Production mode
   npm start
   ```

## 🔧 Configuration

All configuration is managed through environment variables. See [`.env.example`](.env.example) for the complete list.

### Critical Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOVPAY_WEBHOOK_SIGNING_KEY` | ✅ Yes | HMAC key from GOV.UK Pay dashboard |
| `GOVPAY_API_KEY` | ✅ Yes | API key for GOV.UK Pay |
| `DB_PASSWORD` | ✅ Yes | PostgreSQL database password |
| `NODE_ENV` | ⚠️ Recommended | Environment: `local`, `dev`, `staging`, `production` |
| `PORT` | No | HTTP server port (default: 3001) |

### Database Configuration

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=appdb
DB_USER=postgres
DB_PASSWORD=your_secure_password
PGSSLMODE=require  # Use 'require' in production
```

### Security Configuration

```env
SIGNATURE_VERIFICATION_ENABLED=true  # ALWAYS true in production
CORS_ORIGINS=https://your-domain.com
SESSION_SECRET=generate_a_secure_random_string
```

## 📡 API Endpoints

### `POST /callback/payment`

Receives payment webhook notifications from GOV.UK Pay.

**Headers:**
- `Pay-Signature`: HMAC-SHA256 signature of request body (required)
- `X-Correlation-ID`: Request tracking ID (optional, auto-generated if missing)

**Request Body:**
```json
{
  "webhook_id": "evt_12345",
  "event_type": "card_payment_succeeded",
  "resource": {
    "payment_id": "pay_abc123",
    "amount": 15000,
    "state": {
      "status": "success",
      "finished": true
    }
  }
}
```

**Response:**
- `202 Accepted` - Webhook received and queued for processing
- `400 Bad Request` - Invalid payload or missing signature
- `401 Unauthorized` - Invalid signature
- `409 Conflict` - Duplicate webhook (already processed)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### `GET /health`

Health check endpoint for load balancers.

**Response:**
```json
{
  "status": "healthy",
  "service": "callback-service"
}
```

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
npm run test:unit:coverage  # With coverage report
```

### Integration Tests
```bash
npm run test:integration
```

### Test Environment

Integration tests require:
- PostgreSQL database running
- Environment variables set (see `jest.setup.js`)

## 🗄️ Database Schema

### `payment_webhooks` Table

| Column | Type | Description |
|--------|------|-------------|
| `webhook_id` | VARCHAR(255) PK | Unique webhook event ID |
| `payment_id` | VARCHAR(255) | Application/payment reference |
| `event_type` | VARCHAR(100) | Event type (e.g., `card_payment_succeeded`) |
| `status` | VARCHAR(50) | Status: `processing`, `success`, `retry_scheduled`, `dead_letter` |
| `raw_payload` | TEXT | Complete webhook JSON for audit |
| `error_message` | TEXT | Error details if failed |
| `retry_count` | INTEGER | Number of retry attempts |
| `max_retries` | INTEGER | Maximum retries allowed |
| `next_retry_at` | TIMESTAMP | Scheduled next retry time |
| `metadata` | JSONB | Additional metadata (SQS IDs, backend responses) |
| `correlation_id` | VARCHAR(255) | Request correlation ID |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

## 🔄 Retry Logic

The service implements exponential backoff for transient failures:

1. **First retry**: 5 minutes
2. **Second retry**: 10 minutes
3. **Third retry**: 15 minutes
4. **After max retries**: Move to dead-letter queue

### Retryable Errors

- Network timeouts
- Database connection failures
- Temporary service unavailability (503)
- Rate limiting (429)

### Non-Retryable Errors

- Invalid signatures (401)
- Malformed payloads (400)
- Non-existent resources (404)

## 🔒 Security Features

✅ **HMAC-SHA256 Signature Verification**  
✅ **CORS Protection** (configurable origins)  
✅ **Rate Limiting** (100 requests/minute per IP)  
✅ **Security Headers** (X-Frame-Options, CSP, etc.)  
✅ **Sensitive Data Redaction** in logs  
✅ **SQL Injection Protection** (parameterized queries)  
✅ **Request Size Limits** (1MB max)

## 🐛 Troubleshooting

### Common Issues

**Database connection fails**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials
psql -h localhost -U postgres -d appdb
```

**Signature verification fails**
- Verify `GOVPAY_WEBHOOK_SIGNING_KEY` matches GOV.UK Pay dashboard
- Check webhook payload hasn't been modified
- Ensure signature verification is enabled

**Webhooks not processing**
- Check `CALLBACK_SERVICE_ENABLED=true`
- Verify SQS configuration if using Lambda processing
- Review logs: `docker logs inbound-receiver` or check CloudWatch

## 📊 Monitoring

### Logs

Structured JSON logging in production:
```json
{
  "timestamp": "2026-04-24T10:30:45.123Z",
  "level": "info",
  "module": "paymentWebhookService.ts",
  "message": "Webhook received",
  "webhookId": "evt_12345",
  "paymentId": "APP-001"
}
```

### Metrics (when enabled)

- Webhook receive rate
- Processing success rate
- Retry counts
- Dead-letter queue size
- Database query latency

## 🚢 Deployment

### Docker (Recommended)

```bash
# Build image
docker build -t inbound-receiver:latest .

# Run container
docker run -p 3001:3001 \
  --env-file .env \
  inbound-receiver:latest
```

### AWS ECS/Fargate

1. Push image to ECR
2. Create task definition
3. Configure load balancer with `/health` health check
4. Set environment variables in task definition

### Environment-Specific Configuration

**Production:**
- Set `NODE_ENV=production`
- Enable `PGSSLMODE=require`
- Use IAM roles instead of AWS credentials
- Configure CORS with specific origins
- Enable metrics and detailed logging

## 📝 Development

### Code Style

```bash
# Lint code
npm run check:lint

# Format code
npm run fix:pretty

# Run all checks
npm run check
```

### Project Structure

```
inbound-event-receiver/
├── src/
│   ├── config/          # Environment configuration
│   ├── constants/       # SQL queries, error codes
│   ├── controllers/     # HTTP route handlers
│   ├── database/        # Database connection & migrations
│   ├── middlewares/     # Express middlewares
│   ├── repositories/    # Data access layer
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utilities (logger, helpers)
│   ├── validators/      # Request validation
│   ├── app.ts           # Express app setup
│   └── server.ts        # HTTP server startup
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
└── package.json
```

## 🤝 Contributing

1. Follow TypeScript best practices
2. Maintain test coverage above 80%
3. Use conventional commits
4. Update documentation for new features

## 📄 License

[MIT License](LICENSE)

## 🆘 Support

For issues or questions:
- Create an issue in this repository
- Contact the development team
- Review logs in CloudWatch (production)

---

**Version:** 1.0.0  
**Last Updated:** April 24, 2026