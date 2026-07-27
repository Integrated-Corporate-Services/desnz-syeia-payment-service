# Contributing

Thank you for contributing to the Payment Webhook Service.

## Reporting bugs

[Open an issue](https://github.com/Integrated-Corporate-Services/desnz-syeia-payment-service/issues/new) with:
- **Environment:** Node.js version, deployment environment (ECS/local)
- **Steps to reproduce:** Numbered list of actions
- **Expected vs actual behavior**
- **Logs:** Relevant error messages (redact secrets and PII)
- **Webhook payload:** Example payload that causes issue (sanitized)

## Suggesting features

Open an issue describing:
- **Problem statement:** What need does this address?
- **Proposed solution:** How would it work?
- **Alternatives considered:** Other approaches evaluated
- **GDS alignment:** How does this support GDS Service Standard?

## Submitting changes

### Setup

```bash
git clone https://github.com/YOUR-USERNAME/desnz-syeia-payment-service.git
cd desnz-syeia-payment-service
npm install
cp .env.example .env.local
# Edit .env.local with local configuration
npm run build
npm test
```

### Development workflow

```bash
# Create feature branch
git checkout -b feature/improve-error-handling

# Make changes
# ... edit files ...

# Verify code quality
npm run lint              # Check linting
npm run typecheck         # Check TypeScript types
npm run test:unit         # Run unit tests
npm run test:integration  # Run integration tests (requires DB)
npm run build            # Ensure build succeeds

# Commit with conventional format
git commit -m "fix: Handle null payment references gracefully"

# Push and create PR
git push origin feature/improve-error-handling
```

### Commit message format

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Build process, dependencies

**Examples:**
```
feat: Add BACS webhook signature validation
fix: Prevent duplicate webhook processing
docs: Update API endpoint examples
test: Add integration tests for GOV.UK Pay webhooks
refactor: Extract signature validation to middleware
```

### Code standards

**TypeScript:**
- Use TypeScript strict mode
- Explicit return types on functions
- Avoid `any` - use specific types
- Define interfaces for data structures

**File organization:**
```
src/
├── controllers/     # HTTP request handlers
├── services/        # Business logic
├── repositories/    # Database access layer
├── middlewares/     # Express middlewares
├── validators/      # Input validation (Joi)
├── types/          # TypeScript interfaces
└── utils/          # Helper functions
```

**Error handling:**
```typescript
// ✅ Good
try {
  const result = await processWebhook(payload);
  return res.status(202).json({ success: true });
} catch (error) {
  logger.error('Webhook processing failed', { 
    error: error instanceof Error ? error.message : 'Unknown',
    webhookId: payload.webhook_message_id 
  });
  throw new WebhookError('PROCESSING_FAILED', error);
}

// ❌ Bad
try {
  const result = await processWebhook(payload);
  return res.status(202).json({ success: true });
} catch (error) {
  console.log(error);  // Don't use console.log
  throw error;         // Don't throw raw errors
}
```

**Logging best practices:**
```typescript
// ✅ Good - structured with context
logger.info('Webhook received', {
  webhookId: payload.webhook_message_id,
  eventType: payload.event_type,
  paymentId: payload.resource_id
});

// ❌ Bad - string interpolation
console.log(`Webhook ${webhookId} received`);
```

**Testing standards:**
- **Unit tests:** 80%+ coverage target
- **Integration tests:** Critical webhook flows
- **Test naming:** `describe('Component') { it('should behavior') }`
- **Test data:** Use factory functions, not hardcoded values

### Security requirements

**NEVER commit:**
- Real API keys or webhook signing keys
- Database credentials or connection strings
- Real GOV.UK Pay account IDs
- UKSBS BACS credentials
- PII or sensitive payment data
- Production URLs or internal infrastructure details

**ALWAYS:**
- Use `.env.example` with placeholder values (`your_key_here`)
- Redact sensitive data in logs and error messages
- Validate webhook signatures before processing
- Use parameterized SQL queries
- Review dependencies with `npm audit`
- Test signature validation thoroughly

**Report security issues:** See [SECURITY.md](SECURITY.md) for private disclosure process.

## Code review process

1. **Automated checks** (CI/CD)
   - ✅ Build passes
   - ✅ Unit tests pass
   - ✅ Integration tests pass (if applicable)
   - ✅ Linting passes
   - ✅ TypeScript compilation succeeds
   - ✅ No security vulnerabilities (`npm audit`)

2. **Maintainer review**
   - Code quality and style
   - Test coverage and quality
   - Documentation updates
   - Security considerations
   - Performance impact

3. **Feedback and iteration**
   - Address review comments
   - Push updates to same branch
   - Request re-review

4. **Merge**
   - Squash commits for clean history
   - Deploy to dev environment for testing
   - Update CHANGELOG.md

## Documentation

Update documentation when adding features:
- [ ] README.md (if adding endpoints or config)
- [ ] API documentation (for new webhook routes)
- [ ] JSDoc comments on public functions
- [ ] Inline comments for complex logic
- [ ] `.env.example` (for new environment variables)

## Testing guidelines

**Unit tests** (`tests/unit/`):
```typescript
describe('SignatureValidator', () => {
  it('should validate GOV.UK Pay signature correctly', () => {
    const payload = '{"event": "payment.succeeded"}';
    const signature = generateHmac(payload, secret);
    
    expect(validator.verify(payload, signature)).toBe(true);
  });
});
```

**Integration tests** (`tests/integration/`):
```typescript
describe('POST /webhooks/govuk-pay/callback', () => {
  it('should process valid webhook and store in database', async () => {
    const response = await request(app)
      .post('/webhooks/govuk-pay/callback')
      .set('Pay-Signature', validSignature)
      .send(webhookPayload);
    
    expect(response.status).toBe(202);
    expect(await db.webhookExists(webhookId)).toBe(true);
  });
});
```

## Questions?

- **Technical questions:** [GitHub Discussions](https://github.com/Integrated-Corporate-Services/desnz-syeia-payment-service/discussions)
- **Bug reports:** [GitHub Issues](https://github.com/Integrated-Corporate-Services/desnz-syeia-payment-service/issues)
- **Security concerns:** [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

**Thank you for helping improve this service!**
