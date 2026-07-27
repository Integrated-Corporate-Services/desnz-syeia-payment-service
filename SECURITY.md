# Security Policy

## Reporting a vulnerability

**DO NOT** open public issues for security vulnerabilities.
 
**GitHub:** [Private Security Advisory](https://github.com/Integrated-Corporate-Services/desnz-syeia-payment-service/security/advisories/new)

Include:
- Vulnerability description
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

**Response time:**
- Acknowledgment: 2 business days
- Fix: Based on severity (24h-90d)

## Severity levels

| Level | Examples | Response |
|-------|----------|----------|
| **Critical** | RCE, auth bypass, secrets exposure | 24-48h |
| **High** | SQL injection, signature bypass, privilege escalation | 7 days |
| **Medium** | XSS, CSRF, information disclosure | 30 days |
| **Low** | Config issues, minor vulnerabilities | 90 days |

## Security features

### Authentication & Authorization
- HMAC-SHA256 webhook signature validation (GOV.UK Pay standard)
- AWS Secrets Manager for credential storage
- No hardcoded secrets in codebase
- Environment-based configuration

### Network Security
- HTTPS-only communication
- Helmet.js security headers (CSP, HSTS, X-Frame-Options)
- CORS with allowlist configuration
- Rate limiting: 100 requests/min per IP
- Request timeout: 30 seconds

### Data Protection
- SQL injection prevention (parameterized queries with pg)
- Input validation with Joi schemas
- Log sanitization (secrets/PII redacted)
- Database connection encryption (TLS 1.3)
- Webhook payload verification before processing

### Monitoring & Auditing
- Structured JSON logging (Winston)
- Request/response correlation IDs
- Webhook event persistence with timestamps
- Error alerting with contextual information

## Known limitations

1. **Rate limiting is per-instance**
   - Not distributed across ECS tasks
   - Consider AWS WAF for production DDoS protection

2. **Database credentials require periodic refresh**
   - AWS Secrets Manager integration with TTL
   - Service restart may be required for rotation
   - Auto-rotation not yet implemented

3. **No authentication on health check endpoint**
   - `/health` is publicly accessible
   - Required for load balancer health checks
   - Does not expose sensitive information

4. **Webhook signature keys in Secrets Manager**
   - Manual rotation process
   - Requires coordination with GOV.UK Pay / UKSBS
   - Zero-downtime rotation not yet implemented

## Security updates

Dependencies are automatically scanned via:
- **GitHub Dependabot:** Daily vulnerability scanning
- **npm audit:** CI/CD pipeline checks
- **Snyk:** (optional) Container image scanning

To check and update dependencies:
```bash
npm audit                    # Check vulnerabilities
npm audit fix                # Auto-fix (safe updates)
npm audit fix --force        # Force update (test thoroughly)
npm run test                 # Verify no breakage
```

## Security best practices

### For deployers
1. **Use AWS Secrets Manager** - Never use environment variables for secrets in production
2. **Enable CloudWatch logging** - Centralized monitoring with log retention
3. **Configure WAF rules** - DDoS protection and IP allowlisting
4. **Use private subnets** - Database should not be internet-accessible
5. **Rotate secrets quarterly** - 90-day rotation policy
6. **Enable database encryption** - RDS encryption at rest + TLS in transit
7. **Review IAM policies** - Principle of least privilege

### For developers
1. **Never commit `.env` files** - Use `.env.example` with placeholders only
2. **Sanitize logs thoroughly** - Redact tokens, passwords, PII, card numbers
3. **Validate all inputs** - Use Joi schemas for webhook payloads
4. **Use parameterized queries** - Prevent SQL injection
5. **Review dependencies** - Run `npm audit` before each PR
6. **Test signature validation** - Integration tests for all webhook endpoints
7. **Handle errors safely** - Don't expose internal stack traces in responses

## Compliance

This service is designed to comply with:
- **GDS Service Standard** (14 points)
- **NCSC Cloud Security Principles**
- **PCI DSS Level 1** (payment data handling)
- **GDPR** (UK implementation, Article 32)
- **ISO 27001** (information security)

## Incident response

If a security incident occurs:
1. **Contain:** Isolate affected systems
2. **Assess:** Determine scope and impact
3. **Notify:** Report to DESNZ security team immediately
4. **Remediate:** Apply fixes and patches
5. **Review:** Conduct post-incident analysis

## Security contacts

- **Security Team:** Report via GitHub Security Advisories
- **NCSC Reporting:** https://www.ncsc.gov.uk/report-an-incident
- **GDS Security:** For GOV.UK Pay integration issues

## Acknowledgments

We appreciate responsible disclosure from security researchers. Acknowledged contributors will be credited in release notes (unless anonymity is preferred).

---

**Last updated:** 2026-07-27
