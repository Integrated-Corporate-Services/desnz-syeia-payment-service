# Payment Webhook Service

Production-grade webhook integration service for GOV.UK Pay and UKSBS BACS payment systems.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](package.json)

## What it does

Handles inbound webhook events from payment providers with signature validation, idempotency, and event persistence:

1. Receives payment status webhooks from GOV.UK Pay
2. Receives BACS payment notifications from UKSBS
3. Validates HMAC-SHA256 signatures
4. Stores events with deduplication
5. Updates payment records in PostgreSQL

## Quick Start

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your configuration
npm run build
npm start
```

## Architecture

```
GOV.UK Pay ──┐
             │ HTTPS + HMAC
UKSBS BACS ──┼──► Express API ──► PostgreSQL
             │    (Signature      (payment_webhooks)
             └──  Validation)
```

## Configuration

Required environment variables:

```env
# Server
PORT=3000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=appdb


## API Endpoints

### GOV.UK Pay Webhooks
```
POST /webhooks/govuk-pay/callback
Content-Type: application/json
Pay-Signature: {hmac-sha256}

Body: GOV.UK Pay webhook payload
```

### BACS Webhooks
```
POST /webhooks/bacs
Content-Type: application/json
X-BACS-Signature: {hmac-sha256}

Body: UKSBS BACS webhook payload
```

### Health Check
```
GET /health

Response: { "status": "ok", "timestamp": "..." }
```

## Project Structure

```
src/
├── config/          # Configuration
├── constants/       # Constants
├── controllers/     # Request handlers
├── database/        # Database setup
├── middlewares/     # Express middlewares
├── repositories/    # Database access
├── routes/          # Route definitions
├── services/        # Business logic
├── types/          # TypeScript types
├── utils/          # Utilities
├── validators/     # Input validation
├── app.ts
└── server.ts
```

## Testing

```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests (requires DB)
npm run test:coverage      # Coverage report
npm run test:watch        # Watch mode
```

## Security Features

- ✅ HMAC-SHA256 webhook signature validation
- ✅ AWS Secrets Manager integration
- ✅ Rate limiting
- ✅ Helmet.js security headers
- ✅ CORS configuration
- 
### Docker

```bash
docker build -t payment-service .
docker run -p 3000:3000 \
  --env-file .env.local \
  payment-service
```

## Monitoring

The service provides:
- Structured JSON logging (Winston)
- Health check endpoint for load balancers
- Graceful shutdown on SIGTERM
- Request/response correlation IDs

## Error Handling

All errors are categorized and logged with appropriate context:

```typescript
// Example error response
{
  "error": "SIGNATURE_INVALID",
  "message": "Webhook signature validation failed",
  "timestamp": "2026-07-27T10:30:00Z",
  "requestId": "req-abc-123"
}
```

## Performance

- **Throughput:** 100+ requests/second per instance
- **Latency:** <100ms p95 for webhook processing
- **Database:** Connection pooling (max 20 connections)
- **Idempotency:** In-memory cache + database deduplication

## Compliance

This service adheres to:
- GDS Service Standard (14 points)
- NCSC Cloud Security Principles
- PCI DSS Level 1 (payment data handling)
- GDPR (UK implementation)

## Related Documentation

- [GOV.UK Pay Webhook Documentation](https://docs.payments.service.gov.uk/webhooks/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

Report vulnerabilities: [SECURITY.md](SECURITY.md)

## License

[MIT License](LICENSE) - Copyright (c) 2026 Department for Energy Security and Net Zero

---

**Status:** Production  
**Maintained by:** DESNZ Digital Team  
**Last updated:** 2026-07-27
