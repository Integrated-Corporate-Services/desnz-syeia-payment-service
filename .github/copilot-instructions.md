# GitHub Copilot Instructions - Inbound Event Receiver

## Project Overview
This is a TypeScript/Node.js service that handles inbound webhooks from GOV.UK Pay, GOV.UK Notify, and UKSBS. It validates webhook signatures, stores events, and queues them for processing.

## TypeScript Standards

### Type Safety
- Always use explicit types, avoid `any` except when absolutely necessary
- Use `unknown` instead of `any` for truly dynamic data
- Prefer interfaces for object shapes, types for unions/primitives
- Use `as const` for constant objects to ensure immutability

```typescript
// Good
interface WebhookEvent {
  webhook_message_id: string;
  event_type: string;
  resource: Record<string, unknown>;
}

// Bad
let event: any = { ... };
```

### Imports
- Use ES6 import syntax, not `require()`
- Import constants from centralized constant files
- Group imports: external deps → internal modules → types

```typescript
import express from 'express';
import { handleWebhook } from '../controllers/callbackController';
import { HTTP_STATUS } from '../constants/error.constants';
import type { WebhookEvent } from '../types';
```

## Error Handling

### HTTP Status Codes
- Always import from `constants/error.constants.ts`
- Never use magic numbers (200, 404, 500)
- Use `HTTP_STATUS.OK`, `HTTP_STATUS.SERVICE_UNAVAILABLE`, etc.

```typescript
// Good
import { HTTP_STATUS } from '../constants/error.constants';
return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: 'DB down' });

// Bad
return res.status(503).json({ error: 'DB down' });
```

### Try-Catch Blocks
- Always catch errors in async functions
- Log errors before throwing/returning
- Provide meaningful error messages

```typescript
try {
  await pool.query('SELECT 1');
} catch (error) {
  logger.error('[Health] Database check failed', { 
    error: error instanceof Error ? error.message : String(error) 
  });
  throw error;
}
```

## Logging Standards

### Logger Usage
- Import logger: `import getLogger from '../utils/loggerHelper';`
- Initialize: `const logger = getLogger(module);`
- Use structured logging with context objects

```typescript
// Good
logger.info('[Webhook] Processing payment', { 
  paymentId: 'pay_123',
  eventType: 'payment.succeeded' 
});

// Bad
logger.info('Processing payment pay_123');
```

### Log Levels
- `error`: System errors, exceptions, failed operations
- `warn`: Validation failures, business logic issues
- `info`: Key business events (webhook received, payment created)
- `debug`: Detailed diagnostic information

### Log Prefixes
Use consistent prefixes for log messages:
- `[SERVER]` - Server lifecycle events
- `[Webhook]` - Webhook processing
- `[Health]` - Health check operations
- `[Database]` - Database operations
- `[SQS]` - Queue operations

## Database Patterns

### Query Execution
- Always use parameterized queries (prevents SQL injection)
- Use `pool.query()` not individual client connections
- Handle errors and log them

```typescript
// Good
const result = await pool.query(
  'SELECT * FROM webhooks WHERE govuk_pay_id = $1',
  [paymentId]
);

// Bad
const result = await pool.query(
  `SELECT * FROM webhooks WHERE govuk_pay_id = '${paymentId}'`
);
```

### Connection Pooling
- Never call `pool.end()` in request handlers
- Only close pool during graceful shutdown
- Use `checkDatabaseConnectivity()` for health checks

## GOV.UK Pay Webhook Standards

### Required Fields
Every GOV.UK Pay webhook must have:
- `webhook_message_id` (not `webhook_id`)
- `api_version` (default to 1 if missing)
- `event_type`
- `resource_id`
- `resource_type`
- `resource` (object)
- `created_date`

### Signature Verification
- Header name: `pay-signature` (lowercase, hyphenated)
- Algorithm: HMAC-SHA256
- Use `WEBHOOK_SIGNING_ALGORITHM` constant

```typescript
const signature = req.headers['pay-signature'];
const isValid = crypto
  .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
  .update(rawBody, 'utf-8')
  .digest('hex') === signature;
```

## Testing Standards

### Test File Organization
- Separate test file for each function/module
- Name pattern: `[functionName].test.ts`
- Use `describe` blocks for grouping related tests
- Use clear test descriptions: "should [expected behavior] when [condition]"

```typescript
describe('extractWebhookHeaders', () => {
  it('should extract Pay-Signature from headers and webhook_message_id from body', () => {
    // Arrange
    const req = { headers: { 'pay-signature': 'sig123' }, body: { webhook_message_id: 'evt_123' } };
    
    // Act
    const result = extractWebhookHeaders(req);
    
    // Assert
    expect(result.signature).toBe('sig123');
  });
});
```

### Mocking
- Mock external dependencies at the top of test files
- Use `jest.fn()` for function mocks
- Mock before imports: config, logger, database

```typescript
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/utils/loggerHelper', () => jest.fn(() => mockLogger));
```

### Test Coverage Requirements
- Unit tests: Test each exported function independently
- Integration tests: Test end-to-end flows
- Minimum 80% code coverage
- 100% coverage for critical paths (security, payment processing)

## API Design

### Endpoint Naming
- Use REST conventions: `/callback/payment`, `/health`
- Use kebab-case for multi-word endpoints
- Version APIs: `/v1/callback/payment` (when needed)

### Request Validation
- Validate all inputs before processing
- Return 400 for validation errors
- Return 401 for authentication failures
- Return 503 for service unavailable (DB down)

### Response Format
```typescript
// Success
res.status(HTTP_STATUS.OK).json({
  status: 'success',
  data: { ... }
});

// Error
res.status(HTTP_STATUS.BAD_REQUEST).json({
  error: 'Validation failed',
  details: { field: 'webhook_message_id', message: 'Required' }
});
```

## Async/Await Patterns

### Always Use Async/Await
- Don't mix callbacks and promises
- Use `async/await` for all async operations
- Handle rejections with try-catch

```typescript
// Good
async function processWebhook(data: WebhookData): Promise<void> {
  try {
    await validateSignature(data);
    await storeWebhook(data);
    await queueForProcessing(data);
  } catch (error) {
    logger.error('[Webhook] Processing failed', { error });
    throw error;
  }
}

// Bad
function processWebhook(data, callback) {
  validateSignature(data, (err, valid) => {
    if (err) return callback(err);
    // nested callbacks...
  });
}
```

## Environment Variables

### Configuration
- Use centralized config from `config/config.ts`
- Validate required env vars at startup
- Provide sensible defaults for non-critical vars

```typescript
// Good
const port = getNumberConfig('PORT', 3000);

// Bad
const port = process.env.PORT || 3000;
```

### Naming Convention
- Use SCREAMING_SNAKE_CASE
- Prefix with service/component: `DB_HOST`, `GOVPAY_WEBHOOK_SIGNING_KEY`
- Document all env vars in README.md

## Graceful Shutdown

### Process Signals
- Handle `SIGTERM` and `SIGINT`
- Close HTTP server first (stops new requests)
- Then close database pool (waits for active queries)
- Set shutdown timeout (30 seconds recommended)

```typescript
process.on('SIGTERM', async () => {
  logger.info('[SERVER] SIGTERM received, shutting down gracefully');
  await server.close();
  await closePool();
  process.exit(0);
});
```

## Health Checks

### Health Endpoint Requirements
- Verify actual database connectivity (don't just return 200)
- Include latency metrics
- Return 200 if healthy, 503 if unhealthy
- Check all critical dependencies

```typescript
async function healthCheck(req: Request, res: Response): Promise<Response> {
  const dbCheck = await checkDatabaseConnectivity();
  
  if (!dbCheck.connected) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'unhealthy',
      checks: { database: { status: 'down', latency_ms: dbCheck.latencyMs } }
    });
  }
  
  return res.status(HTTP_STATUS.OK).json({
    status: 'healthy',
    checks: { database: { status: 'up', latency_ms: dbCheck.latencyMs } }
  });
}
```

## Code Comments

### When to Comment
- Complex business logic
- Non-obvious workarounds
- Security-critical sections
- GOV.UK Pay specification references

### JSDoc for Public APIs
```typescript
/**
 * Validates GOV.UK Pay webhook signature using HMAC-SHA256
 * @param signature - The Pay-Signature header value
 * @param body - Raw request body string
 * @param signingKey - Webhook signing secret
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  signature: string,
  body: string,
  signingKey: string
): boolean {
  // implementation
}
```

## Security Best Practices

### Input Validation
- Always validate webhook signatures
- Sanitize all user inputs
- Use parameterized SQL queries
- Never log sensitive data (API keys, signatures)

### Rate Limiting
- Implement rate limiting on all public endpoints
- Use distributed rate limiting (Redis) for multi-instance deployments
- Set reasonable limits: 100 requests/minute per IP

### Secrets Management
- Never hardcode secrets
- Use environment variables
- Rotate secrets regularly
- Use AWS Secrets Manager in production

## Performance Considerations

### Database Queries
- Use connection pooling (configured in `db.ts`)
- Index frequently queried columns
- Limit result sets (`LIMIT` clause)
- Avoid N+1 queries

### Caching
- Cache health check results (30 seconds TTL)
- Use Redis for distributed caching
- Cache webhook signatures (prevent replay attacks)

## Documentation Requirements

### Code Documentation
- README.md with setup instructions
- API documentation in `docs/API.md`
- Architecture diagrams in `docs/architecture/`
- Test documentation in TEST_SUMMARY.md

### Commit Messages
- Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`
- Include ticket numbers: `feat: Add health check (SYEIA-1580)`
- Describe what and why, not how

```
feat: Coordinate graceful shutdown of server and DB pool

Prevents inflight database queries from being terminated abruptly
when receiving SIGTERM. Server closes first (stops new connections),
then DB pool closes (waits for active queries).

Closes #123
```

## Common Anti-Patterns to Avoid

### ❌ Don't Do This
```typescript
// Magic numbers
res.status(200).json({ ... });

// Unhandled promises
someAsyncFunction(); // Missing await

// Callback hell
doSomething((err, result) => {
  doSomethingElse((err2, result2) => {
    // ...
  });
});

// Any types everywhere
function process(data: any): any { ... }

// Hardcoded credentials
const apiKey = 'sk_test_123456789';

// SQL injection
const query = `SELECT * FROM users WHERE id = ${userId}`;
```

### ✅ Do This Instead
```typescript
// Use constants
res.status(HTTP_STATUS.OK).json({ ... });

// Await promises
await someAsyncFunction();

// Async/await
const result = await doSomething();
const result2 = await doSomethingElse(result);

// Proper types
function process(data: WebhookData): ProcessResult { ... }

// Environment variables
const apiKey = process.env.GOVPAY_API_KEY;

// Parameterized queries
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

---

## Quick Checklist for PRs

Before submitting a PR, ensure:
- [ ] All tests passing (unit + integration)
- [ ] No TypeScript errors
- [ ] Imports use centralized constants
- [ ] Error handling with try-catch
- [ ] Structured logging with context
- [ ] Database queries are parameterized
- [ ] Env vars validated and documented
- [ ] Health checks verify dependencies
- [ ] Secrets not hardcoded
- [ ] Code commented where necessary
- [ ] Commit messages follow conventions
- [ ] Documentation updated

---

## Resources

- [GOV.UK Pay Webhook Docs](https://docs.payments.service.gov.uk/webhooks/)
- [TypeScript Best Practices](https://typescript-eslint.io/)
- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
