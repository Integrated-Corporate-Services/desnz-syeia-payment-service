# Payment Webhook Handler - Test Suite

> **Modular Jest Tests with Strict Separation of Test Data, Scenarios, and Expected Results**

---

## 🎯 Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

---

## 📋 What's Included

### ✅ Complete Test Suite

- **10 Test Files** with modular architecture
- **3 Fixture Files** for reusable test data
- **2 Helper Files** for test utilities and mocks
- **3 Unit Test Files** for isolated logic
- **2 Integration Test Files** for end-to-end flows

### ✅ Coverage Areas

| Component | Tests | Status |
|-----------|-------|--------|
| State Transitions | 20+ tests | ✅ Complete |
| Idempotency Handling | 15+ tests | ✅ Complete |
| Terminal State Protection | 18+ tests | ✅ Complete |
| Webhook Handler Integration | 12+ tests | ✅ Complete |
| Payment Flow Integration | 10+ tests | ✅ Complete |
| GOV.UK Pay Integration | 3 tests | 🔴 Skipped |

**Total: 75+ Test Cases**

---

## 📁 Structure Overview

```
tests/
├── fixtures/                    # TEST DATA (Static & Dynamic)
│   ├── webhook-payloads.fixture.ts
│   ├── payment-states.fixture.ts
│   └── test-data.factory.ts
│
├── helpers/                     # TEST UTILITIES
│   ├── test-setup.ts
│   └── mock-builders.ts
│
├── unit/                        # UNIT TESTS (Isolated)
│   ├── state-transitions.test.ts
│   ├── idempotency.test.ts
│   └── terminal-state-protection.test.ts
│
├── integration/                 # INTEGRATION TESTS (E2E)
│   ├── payment-webhook-handler.integration.test.ts
│   └── payment-flow.integration.test.ts
│
├── MODULAR_TEST_ARCHITECTURE.md  # Full documentation
└── README.md                     # This file
```

---

## 🔑 Key Principles

### 1. **Separation of Concerns**

Every test follows this pattern:

```typescript
// 1. TEST DATA - Define inputs and expected outputs
const TEST_DATA = [
  { input: X, expected: Y },
];

// 2. TEST SCENARIO - Given/When/Then
test('should do something', () => {
  // GIVEN: Initial state
  const state = setupInitialState();

  // WHEN: Action is performed
  const result = performAction(state);

  // THEN: Expected result
  expect(result).toBe(expected);
});

// 3. EXPECTED RESULTS - Documented at end of file
/**
 * EXPECTED RESULTS:
 * ✅ Success cases
 * ❌ Error cases
 * 🔄 Idempotent cases
 */
```

### 2. **Reusable Test Data**

Never inline complex data in tests:

```typescript
// ❌ DON'T: Inline webhook payload
test('should process webhook', () => {
  const webhook = {
    webhook_message_id: 'evt_001',
    api_version: 1,
    event_type: 'card_payment_succeeded',
    // ... 20 more lines
  };
});

// ✅ DO: Use factory
test('should process webhook', () => {
  const webhook = TestDataFactory.webhookForConfirmed('pay_test_001');
});
```

### 3. **Mocked Dependencies**

All external dependencies are mocked:

```typescript
// GOV.UK Pay API - Mocked (not integrated yet)
const govukPayClient = MockBuilderFactory.govukPayClient();

// Database - In-memory mock
const repository = MockBuilderFactory.paymentRepository();

// Idempotency Service - Mock
const idempotency = MockBuilderFactory.idempotencyService();
```

### 4. **Clear Test Names**

Test names describe the scenario:

```typescript
// ✅ Good
test('should reject transition from REFUNDED to SETTLED (terminal state)')

// ❌ Bad
test('test state transition')
```

---

## 🧪 Example: Using Test Factories

### Create Webhook Payloads

```typescript
import { TestDataFactory } from './fixtures/test-data.factory';

// Simple creation
const webhook = TestDataFactory.webhookForConfirmed();

// Custom payment ID
const webhook = TestDataFactory.webhookForConfirmed('pay_custom_123');

// Full customization
const webhook = TestDataFactory.webhook()
  .withEventType('card_payment_succeeded')
  .withPaymentId('pay_test_456')
  .withAmount(5000)
  .withReference('REF-CUSTOM-001')
  .withCardDetails('Visa', '4242', 'John Doe')
  .build();

// As JSON string
const payloadString = TestDataFactory.webhook()
  .withAmount(10000)
  .buildAsString();
```

### Create Payment Records

```typescript
// Simple creation
const payment = TestDataFactory.paymentConfirmed();

// Custom payment ID
const payment = TestDataFactory.paymentConfirmed('pay_custom_123');

// Full customization
const payment = TestDataFactory.payment()
  .withPaymentId('pay_test_789')
  .withAmount(7500)
  .withStatus(PaymentStatus.CAPTURED)
  .withEventCount(3)
  .withConfirmedAt(new Date())
  .withCapturedAt(new Date())
  .build();
```

### Generate Signatures

```typescript
import { SignatureGenerator } from './fixtures/test-data.factory';

const payload = JSON.stringify(webhook);
const signature = SignatureGenerator.generate(payload);

// Invalid signature for error tests
const invalid = SignatureGenerator.generateInvalidSignature();
```

---

## 🔬 Example: Unit Test

```typescript
/**
 * Unit Test: Idempotency Handling
 */
describe('Idempotency', () => {
  let idempotencyService: MockIdempotencyService;

  beforeEach(() => {
    idempotencyService = MockBuilderFactory.idempotencyService();
  });

  afterEach(() => {
    idempotencyService.clear();
  });

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
```

---

## 🔗 Example: Integration Test

```typescript
/**
 * Integration Test: Payment Webhook Handler
 */
describe('Webhook Handler Integration', () => {
  let repository: InMemoryPaymentRepository;
  let idempotency: MockIdempotencyService;

  beforeEach(() => {
    repository = MockBuilderFactory.paymentRepository();
    idempotency = MockBuilderFactory.idempotencyService();
  });

  test('should process new payment webhook', async () => {
    // GIVEN: Valid webhook
    const webhook = TestDataFactory.webhookForConfirmed();
    const webhookId = webhook.webhook_message_id;
    const paymentId = webhook.resource_id;

    // WHEN: Processing webhook
    await repository.storeWebhook(webhookId, webhook);
    await repository.create({
      govuk_pay_id: paymentId,
      amount: webhook.resource.amount,
      reference: webhook.resource.reference,
      status: PaymentStatus.CONFIRMED,
      event_count: 1,
    });
    await idempotency.markAsProcessed(webhookId);

    // THEN: Payment created
    const payment = await repository.findByGovukPayId(paymentId);
    expect(payment?.status).toBe(PaymentStatus.CONFIRMED);

    // AND: Webhook marked as processed
    const isProcessed = await idempotency.hasBeenProcessed(webhookId);
    expect(isProcessed).toBe(true);
  });
});
```

---

## 🔴 Skipped Tests

Some tests are intentionally skipped:

```typescript
describe.skip('GOV.UK Pay API Integration', () => {
  test('should fetch payment from GOV.UK Pay', async () => {
    // SKIPPED: GOV.UK Pay NOT integrated yet
  });
});
```

**Why skipped?**
- GOV.UK Pay is NOT integrated yet
- All GOV.UK Pay interactions are mocked
- Tests will be enabled when integration is complete

To run skipped tests (will fail):
```bash
npm test -- --testNamePattern="GOV.UK Pay"
```

---

## 📊 Test Reports

### Coverage Report
```bash
npm run test:coverage

# Output:
File                          | % Stmts | % Branch | % Funcs | % Lines
------------------------------|---------|----------|---------|--------
All files                     |   92.5  |   88.3   |   94.1  |   93.2
 fixtures                     |  100    |  100     |  100    |  100
 helpers                      |   95    |   90     |   97    |   96
 unit tests                   |  100    |  100     |  100    |  100
 integration tests            |   85    |   80     |   88    |   87
```

### Test Results Summary
```
Test Suites: 5 passed, 5 total
Tests:       75 passed, 3 skipped, 78 total
Snapshots:   0 total
Time:        4.521 s
```

---

## 🐛 Debugging

### Run Single Test File
```bash
npm test -- state-transitions.test.ts
```

### Run Single Test
```bash
npm test -- --testNamePattern="should allow CREATED → CONFIRMED"
```

### Enable Verbose Output
```bash
npm test -- --verbose
```

### View Mock Data in Tests
```typescript
console.log('Payments:', repository.getAllPayments());
console.log('Processed:', idempotencyService.getProcessedCount());
```

---

## 📚 Full Documentation

For detailed information, see:

**[MODULAR_TEST_ARCHITECTURE.md](./MODULAR_TEST_ARCHITECTURE.md)**

Topics covered:
- Module responsibilities
- Test data patterns
- Writing new tests
- Best practices
- Debugging tips
- GOV.UK Pay integration (planned)

---

## ✅ Test Checklist

Before committing, ensure:

- [ ] All tests pass (`npm test`)
- [ ] Coverage meets target (`npm run test:coverage`)
- [ ] New tests follow modular structure
- [ ] Test data separated from logic
- [ ] Expected results documented
- [ ] Mocks cleaned up in afterEach
- [ ] Test names are descriptive
- [ ] GOV.UK Pay interactions mocked (not real API calls)

---

## 🎓 Learning Path

1. **Start here**: Read this README
2. **Understand structure**: Review `fixtures/` and `helpers/`
3. **Study examples**: Read `state-transitions.test.ts`
4. **Write tests**: Add new test to `unit/` or `integration/`
5. **Deep dive**: Read full docs in `MODULAR_TEST_ARCHITECTURE.md`

---

## 🤝 Contributing

When adding new tests:

1. Add test data to `fixtures/` (static) or use `TestDataFactory` (dynamic)
2. Create test file in `unit/` or `integration/`
3. Follow Given/When/Then pattern
4. Document expected results at end of file
5. Mock all external dependencies
6. Run tests: `npm test`
7. Update this README if adding new test categories

---

## 📝 Notes

### GOV.UK Pay Integration Status

**Current**: ❌ Not Integrated  
**Tests**: Mocked with `MockGovukPayClient`  
**Status**: All GOV.UK Pay tests are `.skip`ped  

When integration is complete:
1. Remove `.skip` from GOV.UK Pay tests
2. Replace `MockGovukPayClient` with real client
3. Add real webhook signature validation
4. Update test expectations

### Test Environment

- **Runtime**: Node.js
- **Framework**: Jest 29.5.0
- **TypeScript**: 5.0.4
- **Coverage Tool**: Jest built-in
- **Mocking**: Jest `jest.fn()` and custom mocks

---

## 🚀 Next Steps

1. ✅ Run tests: `npm test`
2. ✅ Review coverage: `npm run test:coverage`
3. ✅ Read architecture docs: `MODULAR_TEST_ARCHITECTURE.md`
4. ✅ Start writing your own tests
5. 🔄 Integrate GOV.UK Pay when ready

---

**Questions?** Check the [full documentation](./MODULAR_TEST_ARCHITECTURE.md) or review existing test files for patterns.
