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

## Testing Standards - Modular Architecture

### Overview
Follow **strict separation of concerns**: Test Data → Test Scenario → Expected Results

**Key Principles:**
- ✅ Reusable test data through fixtures and factories
- ✅ No inline complex data in test logic
- ✅ Mock all external dependencies (GOV.UK Pay, Database, etc.)
- ✅ Given/When/Then pattern for clarity
- ✅ Comprehensive documentation of expected results

### Test File Organization

#### Directory Structure
```
tests/
├── fixtures/                           # Test Data (Static & Dynamic)
│   ├── webhook-payloads.fixture.ts     # Static webhook payloads
│   ├── payment-states.fixture.ts       # State machine & transition rules
│   └── test-data.factory.ts            # Dynamic data builders
│
├── helpers/                            # Test Utilities
│   ├── test-setup.ts                   # Mock req/res/pool utilities
│   └── mock-builders.ts                # Service/repository mocks
│
├── unit/                               # Unit Tests (Isolated Logic)
│   ├── [feature].test.ts               # One test file per feature
│   └── ...
│
└── integration/                        # Integration Tests (E2E Flows)
    ├── [flow].integration.test.ts      # End-to-end scenarios
    └── ...
```

#### Naming Conventions
- Unit tests: `[functionName].test.ts`
- Integration tests: `[feature].integration.test.ts`
- Fixtures: `[domain].fixture.ts`
- Factories: `[domain].factory.ts`
- Helpers: `[purpose].ts`

### Test Data Patterns

#### Pattern 1: Static Fixtures (Reusable Constants)
Use for data that doesn't change between tests:

```typescript
// tests/fixtures/webhook-payloads.fixture.ts
export const PAYMENT_SUCCEEDED_WEBHOOK: WebhookPayload = {
  webhook_message_id: 'evt_test_succeeded_001',
  api_version: 1,
  event_type: 'card_payment_succeeded',
  resource_id: 'pay_test_001',
  resource: {
    payment_id: 'pay_test_001',
    amount: 10000,
    state: { status: 'success', finished: true }
  }
};
```

#### Pattern 2: Dynamic Factories (Fluent Builders)
Use when data needs customization per test:

```typescript
// tests/fixtures/test-data.factory.ts
export class TestDataFactory {
  static webhook(): WebhookPayloadBuilder {
    return new WebhookPayloadBuilder();
  }
}

// Usage in tests
const webhook = TestDataFactory.webhook()
  .withEventType('card_payment_succeeded')
  .withPaymentId('pay_custom_123')
  .withAmount(5000)
  .build();
```

#### Pattern 3: Convenience Methods
Use for common scenarios:

```typescript
// Factories provide shortcuts
const webhook = TestDataFactory.webhookForConfirmed('pay_test_123');
const payment = TestDataFactory.paymentCaptured('pay_test_456');
const signature = SignatureGenerator.generate(JSON.stringify(webhook));
```

### Test Structure (Given/When/Then)

Every test MUST follow this pattern:

```typescript
describe('Feature Name', () => {
  // ===================================================================
  // TEST DATA - Define at top of file or in fixtures
  // ===================================================================
  const VALID_TRANSITIONS = [
    { from: 'CREATED', to: 'CONFIRMED', shouldSucceed: true },
    { from: 'CONFIRMED', to: 'CAPTURED', shouldSucceed: true },
  ];

  // ===================================================================
  // TEST SCENARIOS
  // ===================================================================
  describe('SCENARIO: Valid State Transitions', () => {
    /**
     * Given: A payment in CREATED state
     * When: Transitioning to CONFIRMED state
     * Then: Transition should be allowed
     */
    test('should allow CREATED → CONFIRMED transition', async () => {
      // GIVEN: Payment in CREATED state
      const currentState = PaymentStatus.CREATED;
      
      // WHEN: Attempting valid transition
      const isValid = await stateService.validateTransition(
        currentState,
        PaymentStatus.CONFIRMED
      );
      
      // THEN: Transition is allowed
      expect(isValid).toBe(true);
    });
  });

  // ===================================================================
  // EXPECTED RESULTS SUMMARY - Document at end of file
  // ===================================================================
  /**
   * EXPECTED RESULTS:
   * 
   * ✅ Valid Transitions:
   *    - CREATED → CONFIRMED allowed
   *    - CONFIRMED → CAPTURED allowed
   * 
   * ❌ Invalid Transitions:
   *    - CONFIRMED → CREATED rejected (regression)
   */
});
```

### Mocking Best Practices

#### Mock Setup (Top of File)
```typescript
// Mock external dependencies BEFORE imports
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/utils/loggerHelper', () => jest.fn(() => mockLogger));
jest.mock('../../src/config/config', () => ({
  getConfig: jest.fn(() => ({ GOVPAY_WEBHOOK_SIGNING_KEY: 'test-key' }))
}));
```

#### Use Mock Builders for Services
```typescript
import { MockBuilderFactory } from '../helpers/mock-builders';

let repository: InMemoryPaymentRepository;
let idempotencyService: MockIdempotencyService;

beforeEach(() => {
  repository = MockBuilderFactory.paymentRepository();
  idempotencyService = MockBuilderFactory.idempotencyService();
});

afterEach(() => {
  repository.clear();
  idempotencyService.clear();
});
```

#### Mock GOV.UK Pay (NOT Integrated Yet)
```typescript
const govukPayClient = MockBuilderFactory.govukPayClient();

// Simulate API delay
govukPayClient.withDelay(100);

// Simulate API failure
govukPayClient.withFailure();
```

### Unit Tests vs Integration Tests

#### Unit Tests (Isolated Logic)
- **Purpose**: Test single function/method in isolation
- **Scope**: One function, all dependencies mocked
- **Location**: `tests/unit/`
- **Pattern**: Data → Pure Logic → Assertion

```typescript
// tests/unit/state-transitions.test.ts
test('should validate state transition', () => {
  // Pure logic test - no dependencies
  const isValid = isValidTransition(
    PaymentStatus.CREATED,
    PaymentStatus.CONFIRMED
  );
  
  expect(isValid).toBe(true);
});
```

#### Integration Tests (Multi-Service Flows)
- **Purpose**: Test interactions between multiple components
- **Scope**: Handler → Service → Repository flow
- **Location**: `tests/integration/`
- **Pattern**: Setup → Flow → Side Effects

```typescript
// tests/integration/payment-webhook-handler.integration.test.ts
test('should process webhook end-to-end', async () => {
  // GIVEN: Valid webhook
  const webhook = TestDataFactory.webhookForConfirmed();
  
  // WHEN: Processing through full flow
  await repository.storeWebhook(webhook.webhook_message_id, webhook);
  await repository.create({
    govuk_pay_id: webhook.resource_id,
    status: PaymentStatus.CONFIRMED,
  });
  await idempotencyService.markAsProcessed(webhook.webhook_message_id);
  
  // THEN: Payment created and webhook processed
  const payment = await repository.findByGovukPayId(webhook.resource_id);
  expect(payment?.status).toBe(PaymentStatus.CONFIRMED);
  
  const isProcessed = await idempotencyService.hasBeenProcessed(
    webhook.webhook_message_id
  );
  expect(isProcessed).toBe(true);
});
```

### Skipped Tests (GOV.UK Pay Integration)

Mark tests that require GOV.UK Pay integration with `.skip`:

```typescript
describe.skip('GOV.UK Pay API Integration', () => {
  /**
   * SKIPPED: GOV.UK Pay NOT integrated yet
   * 
   * This test will be enabled when GOV.UK Pay integration is complete.
   * Currently, all GOV.UK Pay interactions are mocked.
   */
  test('should fetch payment from GOV.UK Pay API', async () => {
    // Test implementation
  });
});
```

### Test Coverage Requirements

- **Unit Tests**: 100% coverage for business logic
- **Integration Tests**: 90% coverage for critical flows
- **Overall**: Minimum 85% code coverage
- **Critical Paths**: 100% coverage (security, payment processing, state transitions)

### Test Documentation

Every test file MUST include:

1. **File Header**: Purpose and scope
2. **Test Data Section**: Clearly separated at top
3. **Test Scenarios**: Grouped by feature/behavior
4. **Expected Results**: Documented at end of file

```typescript
/**
 * ===================================================================
 * Unit Tests: Payment State Transitions
 * ===================================================================
 * Tests payment state transition validation logic
 * 
 * Structure:
 * 1. TEST DATA - Static transition scenarios
 * 2. TEST SCENARIOS - Given/When/Then test cases
 * 3. EXPECTED RESULTS - Assertions summary
 */

// Test data at top
const VALID_TRANSITIONS = [ ... ];

// Test scenarios in middle
describe('State Transitions', () => { ... });

// Expected results at bottom
/**
 * EXPECTED RESULTS:
 * ✅ Valid transitions allowed
 * ❌ Invalid transitions rejected
 * 🔄 Idempotent for duplicate events
 */
```

### Common Test Anti-Patterns to Avoid

#### ❌ Don't Do This
```typescript
// Inline complex payloads
test('should process webhook', () => {
  const webhook = {
    webhook_message_id: 'evt_001',
    api_version: 1,
    event_type: 'card_payment_succeeded',
    // ... 20 more lines of nested data
  };
});

// No Given/When/Then structure
test('test webhook', () => {
  const result = processWebhook(data);
  expect(result).toBe(true);
});

// Magic values without context
expect(payment.event_count).toBe(3);

// Shared mutable state between tests
let globalPayment = { ... };
```

#### ✅ Do This Instead
```typescript
// Use factories
test('should process webhook', () => {
  const webhook = TestDataFactory.webhookForConfirmed('pay_123');
});

// Clear Given/When/Then
test('should process webhook successfully', () => {
  // GIVEN: Valid webhook
  const webhook = TestDataFactory.webhookForConfirmed();
  
  // WHEN: Processing webhook
  const result = processWebhook(webhook);
  
  // THEN: Processing succeeds
  expect(result.success).toBe(true);
});

// Explain magic values with constants
const EXPECTED_EVENT_COUNT_AFTER_CAPTURED = 3;
expect(payment.event_count).toBe(EXPECTED_EVENT_COUNT_AFTER_CAPTURED);

// Fresh state for each test
beforeEach(() => {
  payment = TestDataFactory.paymentCreated();
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm test tests/unit

# Run integration tests only
npm test tests/integration

# Run specific test file
npm test -- state-transitions.test.ts

# Run with coverage
npm run test:coverage

# Watch mode (development)
npm run test:watch
```

### Test Documentation Location

- **Quick Start**: `tests/README.md`
- **Architecture Guide**: `tests/MODULAR_TEST_ARCHITECTURE.md`
- **Files Summary**: `tests/FILES_SUMMARY.md`

### Example: Complete Unit Test

```typescript
/**
 * ===================================================================
 * Unit Tests: Idempotency Handling
 * ===================================================================
 * Tests webhook idempotency to prevent duplicate processing
 */

import { MockIdempotencyService, MockBuilderFactory } from '../helpers/mock-builders';
import { TestDataFactory } from '../fixtures/test-data.factory';

// ===================================================================
// TEST DATA
// ===================================================================
const DUPLICATE_SCENARIOS = [
  { webhookId: 'evt_001', description: 'First webhook arrival' },
  { webhookId: 'evt_001', description: 'Duplicate webhook' }
];

// ===================================================================
// TEST SCENARIOS
// ===================================================================
describe('Idempotency Handling', () => {
  let idempotencyService: MockIdempotencyService;

  beforeEach(() => {
    idempotencyService = MockBuilderFactory.idempotencyService();
  });

  afterEach(() => {
    idempotencyService.clear();
  });

  /**
   * Given: Webhook already processed
   * When: Same webhook arrives again
   * Then: Should detect as duplicate
   */
  test('should detect duplicate webhook', async () => {
    // GIVEN: Webhook already processed
    const webhookId = 'evt_test_001';
    await idempotencyService.markAsProcessed(webhookId);

    // WHEN: Same webhook arrives again
    const isDuplicate = await idempotencyService.hasBeenProcessed(webhookId);

    // THEN: Detected as duplicate
    expect(isDuplicate).toBe(true);
  });
});

// ===================================================================
// EXPECTED RESULTS
// ===================================================================
/**
 * EXPECTED RESULTS:
 * ✅ First-time webhooks: Processed successfully
 * 🔄 Duplicate webhooks: Detected and skipped
 * 🛡️ No state changes on duplicates
 */
```

### Example: Complete Integration Test

```typescript
/**
 * ===================================================================
 * Integration Tests: Payment Webhook Handler
 * ===================================================================
 * Tests end-to-end webhook handling flow
 */

import {
  InMemoryPaymentRepository,
  MockIdempotencyService,
  MockBuilderFactory
} from '../helpers/mock-builders';
import { TestDataFactory } from '../fixtures/test-data.factory';
import { PaymentStatus } from '../fixtures/payment-states.fixture';

describe('Payment Webhook Handler - Integration', () => {
  let repository: InMemoryPaymentRepository;
  let idempotencyService: MockIdempotencyService;

  beforeEach(() => {
    repository = MockBuilderFactory.paymentRepository();
    idempotencyService = MockBuilderFactory.idempotencyService();
    TestDataFactory.reset();
  });

  afterEach(() => {
    repository.clear();
    idempotencyService.clear();
  });

  test('should process new payment webhook end-to-end', async () => {
    // GIVEN: Valid webhook
    const webhook = TestDataFactory.webhookForConfirmed('pay_test_123');
    const webhookId = webhook.webhook_message_id;
    const paymentId = webhook.resource_id;

    // WHEN: Processing webhook through full flow
    await repository.storeWebhook(webhookId, webhook);
    
    await repository.create({
      govuk_pay_id: paymentId,
      amount: webhook.resource.amount,
      reference: webhook.resource.reference,
      status: PaymentStatus.CONFIRMED,
      event_count: 1,
    });
    
    await idempotencyService.markAsProcessed(webhookId);

    // THEN: Payment created in database
    const payment = await repository.findByGovukPayId(paymentId);
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe(PaymentStatus.CONFIRMED);
    expect(payment?.amount).toBe(webhook.resource.amount);

    // AND: Webhook marked as processed
    const isProcessed = await idempotencyService.hasBeenProcessed(webhookId);
    expect(isProcessed).toBe(true);

    // AND: Webhook stored for audit trail
    const webhookExists = await repository.webhookExists(webhookId);
    expect(webhookExists).toBe(true);
  });
});
```

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

### Code Quality
- [ ] All tests passing (unit + integration)
- [ ] No TypeScript errors
- [ ] Test coverage meets targets (85% overall, 100% critical paths)
- [ ] Imports use centralized constants
- [ ] Error handling with try-catch
- [ ] Structured logging with context

### Testing (Modular Architecture)
- [ ] Test data separated from test logic (use fixtures/factories)
- [ ] Tests follow Given/When/Then pattern
- [ ] Expected results documented at end of test files
- [ ] All external dependencies mocked
- [ ] GOV.UK Pay interactions use `MockGovukPayClient`
- [ ] Mocks cleaned up in `afterEach()`
- [ ] Test names are descriptive and follow conventions

### Database & Security
- [ ] Database queries are parameterized
- [ ] Env vars validated and documented
- [ ] Health checks verify dependencies
- [ ] Secrets not hardcoded
- [ ] Rate limiting implemented on public endpoints

### Documentation
- [ ] Code commented where necessary
- [ ] Commit messages follow conventions
- [ ] Documentation updated (README, API docs)
- [ ] Test documentation in appropriate location

---

## Resources

- [GOV.UK Pay Webhook Docs](https://docs.payments.service.gov.uk/webhooks/)
- [TypeScript Best Practices](https://typescript-eslint.io/)
- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- **Project Test Docs**: `tests/README.md` and `tests/MODULAR_TEST_ARCHITECTURE.md`
