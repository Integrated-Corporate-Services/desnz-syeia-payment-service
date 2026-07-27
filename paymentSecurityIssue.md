# Payment Service - Public Release Readiness Checklist

**Service:** `desnz-syeia-payment-service` (Inbound Event Receiver)  
**Purpose:** GOV.UK Pay and BACS webhook integration microservice  
**Status:** ⚠️ **NOT READY** - 7 critical issues identified  
**Target:** GDS Service Standard + Open Source Best Practices  
**Date:** 2026-07-27

---

## 🎯 Executive Summary

The Payment Service is a well-architected Node.js microservice handling webhook integrations from GOV.UK Pay and UKSBS BACS. Code quality is production-ready, but **public release requires 7 mandatory changes** to meet GDS standards.

**Estimated Time to Public-Ready:** 2-3 hours

---

## 🔴 CRITICAL BLOCKERS (Must Fix Before Public Release)

### 1. ❌ Real `.env` File Committed to Repository

**Issue:**
```
desnz-syeia-payment-service/.env exists (50 lines)
```

**Risk:** HIGH - May contain real secrets, database credentials, API keys

**Fix:**
```bash
cd desnz-syeia-payment-service

# 1. Backup if needed
cp .env .env.backup.local

# 2. Delete from repository
rm .env

# 3. Ensure .gitignore blocks it
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore

# 4. Remove from Git history (if previously committed)
git rm --cached .env
git commit -m "security: Remove .env file from repository"

# 5. Verify .env.example is sufficient
cat .env.example  # Should have template values only
```

**Verification:**
- [ ] `.env` deleted from working directory
- [ ] `.env` removed from Git history
- [ ] `.gitignore` contains `.env` pattern
- [ ] `.env.example` exists with placeholder values
- [ ] All secrets use `your_*_here` or similar placeholders

---

### 2. ❌ Missing README.md

**Issue:** No README.md file exists at repository root

**Required Content (GDS Standard):**

Create: `desnz-syeia-payment-service/README.md`

```markdown
# GOV.UK Payment Webhook Service

Microservice for handling webhook integrations from GOV.UK Pay and UKSBS BACS payment systems.

[![Build Status](https://github.com/DESNZ/payment-service/workflows/CI/badge.svg)](https://github.com/DESNZ/payment-service/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](package.json)

## What it does

This service:
- Receives payment status updates from GOV.UK Pay
- Processes BACS payment notifications from UKSBS
- Validates webhook signatures (HMAC-SHA256)
- Stores payment events in PostgreSQL
- Provides idempotent webhook handling with deduplication

## Who should use this

UK Government departments and public sector organisations that:
- Use GOV.UK Pay for card payments
- Integrate with UKSBS for BACS Direct Debit
- Need reliable webhook event processing
- Require audit trails for payment transactions

## Before you start

You need:
- Node.js 22.x or higher
- PostgreSQL 12+ database
- GOV.UK Pay account with webhook signing keys
- UKSBS BACS integration credentials

## Installation

```bash
npm install
npm run build
npm start
```

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=appdb
DB_USER=postgres

# GOV.UK Pay
GOVPAY_API_URL=https://publicapi.payments.service.gov.uk/v1/payments
GOVPAY_API_KEY=your_api_key_here
GOVPAY_WEBHOOK_SIGNING_KEY=your_signing_key_here

# UKSBS BACS
BACS_WEBHOOK_SIGNING_KEY=your_bacs_signing_key_here
```

## API Endpoints

### GOV.UK Pay Webhooks
```
POST /webhooks/govuk-pay/callback
Content-Type: application/json
Pay-Signature: {hmac-sha256-signature}
```

### BACS Webhooks
```
POST /webhooks/bacs
Content-Type: application/json
X-BACS-Signature: {hmac-sha256-signature}
```

See [API Documentation](docs/API.md) for full endpoint specs.

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (requires PostgreSQL)
npm run test:integration

# Test coverage
npm run test:coverage
```

## Deployment

This service is designed for AWS ECS deployment:

- Uses AWS Secrets Manager for credentials
- Health check endpoint: `GET /health`
- Graceful shutdown with SIGTERM handling
- Structured JSON logging (Winston)

See [Deployment Guide](.github/workflows/DEPLOYMENT-GUIDE.md) for CI/CD setup.

## Architecture

```
┌─────────────┐
│  GOV.UK Pay │──┐
└─────────────┘  │
                 │ HTTPS + HMAC
┌─────────────┐  │
│  UKSBS BACS │──┼──► ┌──────────────┐
└─────────────┘  │    │   Express    │
                 │    │  Webhook API │
                 └────┤              │
                      │  - Signature │
                      │  - Validator │
                      │  - Dedup     │
                      └──────┬───────┘
                             │
                             ▼
                      ┌──────────────┐
                      │  PostgreSQL  │
                      │  payment_    │
                      │  webhooks    │
                      └──────────────┘
```

## Security

- ✅ HMAC-SHA256 signature validation on all webhooks
- ✅ AWS Secrets Manager integration
- ✅ Helmet.js security headers
- ✅ Rate limiting (100 req/min)
- ✅ Request timeout enforcement
- ✅ SQL injection prevention (parameterized queries)
- ✅ Log sanitization (secrets redacted)

Report vulnerabilities: [SECURITY.md](SECURITY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

This is a UK Government project. We welcome contributions that:
- Fix bugs or security issues
- Improve documentation
- Add test coverage
- Enhance error handling

## License

This project is licensed under the [MIT License](LICENSE).

## Support

- **Issues:** [GitHub Issues](https://github.com/DESNZ/payment-service/issues)
- **Documentation:** [docs/](docs/)
- **GOV.UK Pay Docs:** https://docs.payments.service.gov.uk/

## Related Projects

- [GOV.UK Pay](https://github.com/alphagov/pay)
- [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend)
```

**Verification:**
- [ ] README.md created with all sections
- [ ] Badges point to correct repository
- [ ] API examples are accurate
- [ ] Architecture diagram renders correctly
- [ ] Links to other docs are valid

---

### 3. ❌ Missing LICENSE File

**Issue:** `package.json` declares "ISC" but no LICENSE file exists

**GDS Requirement:** MIT or OGL (Open Government Licence)

**Fix:**

Create: `desnz-syeia-payment-service/LICENSE`

**Option A - MIT License (Recommended for reusability):**
```
MIT License

Copyright (c) 2026 Department for Energy Security and Net Zero

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Option B - OGL (UK Government Standard):**
```
Open Government Licence v3.0

You are encouraged to use and re-use the Information that is available under 
this licence freely and flexibly, with only a few conditions.

Using Information under this licence
Use of copyright and database right material expressly made available under 
this licence (the 'Information') indicates your acceptance of the terms and 
conditions below.

The Licensor grants you a worldwide, royalty-free, perpetual, non-exclusive 
licence to use the Information subject to the conditions below.

You are free to:
- copy, publish, distribute and transmit the Information;
- adapt the Information;
- exploit the Information commercially and non-commercially for example, by 
  combining it with other Information, or by including it in your own product 
  or application.

You must, where you do any of the above:
- acknowledge the source of the Information by including the following 
  attribution statement: Contains public sector information licensed under 
  the Open Government Licence v3.0.

Full licence text: http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
```

**Update package.json:**
```json
{
  "license": "MIT"  // or "OGL-UK-3.0"
}
```

**Verification:**
- [ ] LICENSE file created
- [ ] package.json license field matches
- [ ] Copyright holder is correct
- [ ] Year is current (2026)

---

### 4. ❌ Missing CONTRIBUTING.md

**Issue:** No contribution guidelines for open source contributors

Create: `desnz-syeia-payment-service/CONTRIBUTING.md`

```markdown
# Contributing to GOV.UK Payment Webhook Service

Thank you for your interest in contributing to this UK Government project.

## Before you start

This service is maintained by the Department for Energy Security and Net Zero (DESNZ). We welcome contributions from:
- Government developers
- Public sector technology teams
- Open source community members

## How to contribute

### Reporting bugs

[Create an issue](https://github.com/DESNZ/payment-service/issues/new) with:
- **Title:** Short description of the bug
- **Environment:** Node.js version, OS, deployment environment
- **Steps to reproduce:** Numbered list
- **Expected behavior:** What should happen
- **Actual behavior:** What actually happens
- **Logs:** Relevant error messages (redact secrets!)

### Suggesting features

Open an issue with:
- **Problem statement:** What need does this address?
- **Proposed solution:** How would it work?
- **Alternatives considered:** Other approaches you evaluated
- **GDS alignment:** How does this fit GDS Service Standard?

### Submitting pull requests

1. **Fork the repository**
   ```bash
   git clone https://github.com/YOUR-USERNAME/payment-service.git
   cd payment-service
   npm install
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/improve-error-handling
   ```

3. **Make your changes**
   - Write code that follows existing patterns
   - Add tests for new functionality
   - Update documentation
   - Follow coding standards (see below)

4. **Test thoroughly**
   ```bash
   npm run lint
   npm run test:unit
   npm run test:integration
   npm run build
   ```

5. **Commit with clear messages**
   ```bash
   git commit -m "fix: Handle null payment references gracefully"
   ```

   Use conventional commits:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation only
   - `refactor:` Code refactoring
   - `test:` Adding tests
   - `chore:` Maintenance tasks

6. **Push and create PR**
   ```bash
   git push origin feature/improve-error-handling
   ```

   Then open a pull request on GitHub with:
   - Clear title describing the change
   - Description of what changed and why
   - Reference to related issues
   - Test evidence (screenshots, logs)

## Coding standards

### TypeScript Style
- Use TypeScript strict mode
- Explicit return types on functions
- Avoid `any` - use specific types
- Use interfaces for data structures

### File Organization
```
src/
├── controllers/     # Request handlers
├── services/        # Business logic
├── repositories/    # Database access
├── middlewares/     # Express middlewares
├── validators/      # Input validation
├── types/          # TypeScript types
└── utils/          # Helper functions
```

### Error Handling
```typescript
// ✅ Good
try {
  const result = await processPayment(data);
  return result;
} catch (error) {
  logger.error('Payment processing failed', { error, data });
  throw new PaymentError('PROCESSING_FAILED', error);
}

// ❌ Bad
try {
  const result = await processPayment(data);
  return result;
} catch (error) {
  console.log(error);  // Don't use console.log
  throw error;         // Don't throw raw errors
}
```

### Testing Standards
- **Unit tests:** 80%+ coverage
- **Integration tests:** Critical paths
- **Test naming:** `describe('what') { it('should do something') }`
- **Fixtures:** Use factory functions, not hardcoded data

### Documentation
- JSDoc comments on public functions
- Inline comments for complex logic
- README updates for new features
- Architecture decision records for significant changes

## Security requirements

**NEVER commit:**
- Real API keys or secrets
- Database credentials
- Personally identifiable information (PII)
- Production URLs or account IDs

**ALWAYS:**
- Use `.env.example` with placeholder values
- Redact sensitive data in logs
- Validate all webhook signatures
- Parameterize SQL queries
- Review dependencies for vulnerabilities

Report security issues privately: [SECURITY.md](SECURITY.md)

## Code review process

1. **Automated checks run** (CI/CD pipeline)
   - Build passes
   - Tests pass
   - Linting passes
   - Security scan passes

2. **Maintainer reviews code**
   - Code quality
   - Test coverage
   - Documentation
   - GDS alignment

3. **Changes requested or approved**
   - Address feedback
   - Push updates
   - Re-review

4. **Merge to main**
   - Squash commits
   - Deploy to dev environment
   - Create release notes

## Questions?

- **Technical questions:** [GitHub Discussions](https://github.com/DESNZ/payment-service/discussions)
- **Bug reports:** [GitHub Issues](https://github.com/DESNZ/payment-service/issues)
- **Security concerns:** See [SECURITY.md](SECURITY.md)

## License

By contributing, you agree your contributions will be licensed under the same [MIT License](LICENSE) that covers this project.
```

**Verification:**
- [ ] CONTRIBUTING.md created
- [ ] Links point to correct repository
- [ ] Security guidance is clear
- [ ] Examples are accurate

---

### 5. ❌ Missing SECURITY.md

**Issue:** No security vulnerability disclosure policy

Create: `desnz-syeia-payment-service/SECURITY.md`

```markdown
# Security Policy

## Reporting a vulnerability

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security issues responsibly:

### For UK Government teams
Contact: **security@energysecurity.gov.uk**

### For external researchers
Use [GitHub Security Advisories](https://github.com/DESNZ/payment-service/security/advisories/new)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline
- **Initial response:** Within 2 business days
- **Status update:** Within 7 days
- **Fix timeline:** Depends on severity (see below)

## Severity levels

| Severity | Description | Response Time |
|----------|-------------|---------------|
| **Critical** | Remote code execution, authentication bypass | 24-48 hours |
| **High** | SQL injection, secrets exposure, privilege escalation | 7 days |
| **Medium** | XSS, CSRF, information disclosure | 30 days |
| **Low** | Minor configuration issues, informational | 90 days |

## Security features

This service implements:

### Authentication & Authorization
- ✅ HMAC-SHA256 webhook signature validation
- ✅ AWS Secrets Manager for credential storage
- ✅ No hardcoded secrets in code
- ✅ Environment variable configuration

### Network Security
- ✅ HTTPS-only communication
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Rate limiting (100 req/min per IP)

### Data Protection
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation (Joi schemas)
- ✅ Log sanitization (secrets redacted)
- ✅ Database connection encryption (SSL/TLS)

### Monitoring & Auditing
- ✅ Structured logging (Winston)
- ✅ Request/response tracking
- ✅ Error alerting
- ✅ Audit trail for all webhook events

## Known limitations

1. **Rate limiting is per-instance**
   - Not distributed across multiple containers
   - Consider AWS WAF for production

2. **Database credentials refreshed periodically**
   - Uses AWS Secrets Manager
   - 10-minute TTL cache
   - Service restart may be required for rotation

3. **No authentication on health check endpoint**
   - `/health` is public
   - Does not expose sensitive information
   - Required for load balancer health checks

## Security updates

Dependencies are automatically scanned via:
- **GitHub Dependabot:** Daily vulnerability scanning
- **npm audit:** CI/CD pipeline check
- **Snyk:** Container image scanning (if configured)

To update dependencies:
```bash
npm audit
npm audit fix
npm run test
```

## Security best practices

### For deployers
1. **Rotate secrets regularly** (90-day cycle)
2. **Use AWS Secrets Manager** (don't use environment variables in production)
3. **Enable CloudWatch logging** (centralized monitoring)
4. **Configure WAF rules** (DDoS protection)
5. **Use private subnets** (database isolation)

### For contributors
1. **Never commit `.env` files** (use `.env.example` only)
2. **Sanitize logs** (redact PII, tokens, passwords)
3. **Validate all inputs** (use Joi schemas)
4. **Use parameterized queries** (prevent SQL injection)
5. **Review dependencies** (run `npm audit` before PR)

## Compliance

This service is designed to comply with:
- **GDS Service Standard** (14 points)
- **NCSC Cloud Security Principles**
- **PCI DSS** (payment data handling)
- **GDPR** (UK implementation)

## Security contacts

- **DESNZ Security Team:** security@energysecurity.gov.uk
- **GitHub Security:** https://github.com/DESNZ/payment-service/security
- **NCSC Report:** https://www.ncsc.gov.uk/report-an-incident

## Acknowledgments

We appreciate responsible disclosure from security researchers. Acknowledged contributors will be credited in release notes (unless anonymity is preferred).

---

**Last updated:** 2026-07-27
```

**Verification:**
- [ ] SECURITY.md created
- [ ] Contact emails are valid
- [ ] Response timelines are realistic
- [ ] Security features list is accurate

---

### 6. ❌ Missing CODE_OF_CONDUCT.md

Create: `desnz-syeia-payment-service/CODE_OF_CONDUCT.md`

```markdown
# Code of Conduct

## Our pledge

As contributors and maintainers of this UK Government project, we pledge to make participation in our community a harassment-free experience for everyone, regardless of:
- Age, body size, disability, ethnicity
- Sex characteristics, gender identity and expression
- Level of experience, education, socio-economic status
- Nationality, personal appearance, race, religion
- Sexual identity and orientation

We are committed to the Civil Service values of:
- **Integrity:** Honest and objective
- **Honesty:** Truthful and open
- **Objectivity:** Evidence-based decisions
- **Impartiality:** Acting solely in the public interest

## Our standards

### Positive behavior
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members
- Providing technical feedback professionally

### Unacceptable behavior
- Trolling, insulting/derogatory comments, personal or political attacks
- Public or private harassment
- Publishing others' private information without permission
- Conduct which could reasonably be considered inappropriate
- Spam, off-topic discussions, or commercial promotion

## Responsibilities

Project maintainers are responsible for:
- Clarifying standards of acceptable behavior
- Taking appropriate corrective action in response to unacceptable behavior
- Removing, editing, or rejecting contributions that violate this code
- Temporarily or permanently banning contributors for inappropriate behavior

## Scope

This Code of Conduct applies to:
- Project repositories (code, issues, pull requests)
- Project communication channels (discussions, email)
- Public spaces when representing the project
- Official project social media accounts

## Enforcement

### Reporting violations

Report unacceptable behavior to:
- **Email:** conduct@energysecurity.gov.uk
- **GitHub:** [Report abuse](https://github.com/DESNZ/payment-service/security)

All reports will be:
- Reviewed and investigated promptly and fairly
- Kept confidential
- Handled by project maintainers who are not involved in the incident

### Consequences

Violations may result in:
1. **Warning:** Private written warning with clarification of violation
2. **Temporary ban:** Suspension from project spaces for specified period
3. **Permanent ban:** Permanent removal from all project spaces

The severity of the consequence depends on:
- Nature of the violation
- History of previous violations
- Impact on the community

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org/version/2/0/code_of_conduct.html) and aligned with the [Civil Service Code](https://www.gov.uk/government/publications/civil-service-code).

## Questions

For questions about this Code of Conduct, contact: conduct@energysecurity.gov.uk

---

**Version:** 1.0  
**Last updated:** 2026-07-27
```

**Verification:**
- [ ] CODE_OF_CONDUCT.md created
- [ ] Contact emails are valid
- [ ] Aligned with Civil Service values
- [ ] Clear enforcement process

---

### 7. ⚠️ Deployment Documentation Contains Internal URLs

**Issue:** `.github/workflows/DEPLOYMENT-GUIDE.md` contains internal URLs

**Current:**
```markdown
- URL: `https://dev.syeia.energysecurity.gov.uk`
- URL: `https://uat.syeia.energysecurity.gov.uk`
- URL: `https://www.syeia.energysecurity.gov.uk`
```

**Fix Options:**

**Option A - Genericize (Recommended for public repo):**
```markdown
- URL: `https://dev.your-domain.gov.uk` (or configure via environment)
- URL: `https://uat.your-domain.gov.uk`
- URL: `https://www.your-domain.gov.uk`
```

**Option B - Keep with disclaimer:**
```markdown
> **Note:** URLs shown are examples from DESNZ SYEIA production deployment.
> Replace with your own domain in your environment configuration.

- Dev: `https://dev.syeia.energysecurity.gov.uk` (example)
- UAT: `https://uat.syeia.energysecurity.gov.uk` (example)
- Prod: `https://www.syeia.energysecurity.gov.uk` (example)
```

**Files to update:**
- `.github/workflows/DEPLOYMENT-GUIDE.md`
- `.github/workflows/DEPLOYMENT-FLOW.md`
- `.github/workflows/QUICK-START.md`

**Verification:**
- [ ] Internal URLs documented as examples
- [ ] Configuration instructions added
- [ ] No AWS account IDs exposed
- [ ] No API keys in docs

---

## ✅ SECURITY AUDIT - PASSED

### Credentials Review
- ✅ No hardcoded passwords in source code
- ✅ No API keys in source code
- ✅ No database credentials in source code
- ✅ AWS Secrets Manager integration present
- ✅ Environment variable pattern used
- ✅ `.env.example` has placeholder values only

### Code Review
- ✅ SQL queries use parameterized statements
- ✅ HMAC signature validation on webhooks
- ✅ Input validation with Joi schemas
- ✅ Log sanitization implemented (passwords/tokens redacted)
- ✅ HTTPS-only communication
- ✅ Rate limiting configured
- ✅ Security headers (Helmet.js)

### Sensitive Data
- ✅ No internal email addresses (@ics.gov.uk, @6dg.co.uk) in code
- ✅ No AWS account IDs hardcoded
- ✅ No proprietary business logic exposed
- ✅ No customer data in examples

---

## 📋 ADDITIONAL IMPROVEMENTS (Recommended)

### Documentation
- [ ] Add API documentation with OpenAPI/Swagger spec
- [ ] Create architecture decision records (ADRs)
- [ ] Document local development setup
- [ ] Add troubleshooting guide

### Testing
- [ ] Increase unit test coverage to 85%+
- [ ] Add integration test examples
- [ ] Document test data generation
- [ ] Add performance test baselines

### GitHub Configuration
- [ ] Add repository description
- [ ] Add topics: `govuk`, `payments`, `webhooks`, `nodejs`, `typescript`
- [ ] Configure branch protection rules
- [ ] Enable Dependabot alerts
- [ ] Add issue templates
- [ ] Add pull request template

### CI/CD
- [ ] Add security scanning (SAST)
- [ ] Add container scanning
- [ ] Add code quality checks (SonarQube)
- [ ] Configure automated releases

---

## 🚀 RELEASE PROCESS

Once all critical blockers are resolved:

### 1. Pre-release checklist
- [ ] All critical issues resolved
- [ ] Documentation complete
- [ ] Security review passed
- [ ] Legal approval obtained
- [ ] Internal stakeholders notified

### 2. Create release
```bash
# Tag version
git tag -a v1.0.0 -m "Initial public release"
git push origin v1.0.0

# Create GitHub release
gh release create v1.0.0 \
  --title "v1.0.0 - Initial Public Release" \
  --notes "See CHANGELOG.md for details"
```

### 3. Post-release
- [ ] Announce on GDS Slack
- [ ] Post on GOV.UK Technology blog
- [ ] Update service catalog
- [ ] Monitor for issues/questions

---

## 📞 SUPPORT

**Questions about this checklist:**
- Technical Lead: [TBD]
- Security Review: security@energysecurity.gov.uk
- GDS Compliance: [TBD]

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-27  
**Next Review:** Before public release