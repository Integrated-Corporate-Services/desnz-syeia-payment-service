# Security Policy

## Reporting a vulnerability

**DO NOT** open public issues for security vulnerabilities.
 
**GitHub:** [Private Security Advisory](https://github.com/Integrated-Corporate-Services/desnz-syeia-payment-service/)

Include:
- Vulnerability description
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

**Response time:**
- Acknowledgment: 2 business days
- Fix: Based on severity (24h-90d)

## Security best practices

### For developers
1. **Never commit `.env` files** - Use `.env.example` with placeholders only
2. **Review dependencies** - Run `npm audit` before each PR
3. **Test signature validation** - Integration tests for all webhook endpoints
4. **Handle errors safely** - Don't expose internal stack traces in responses

## Compliance

This service is designed to comply with:
- **GDS Service Standard** (14 points)
- **NCSC Cloud Security Principles**
- **PCI DSS Level 1** (payment data handling)
- **GDPR** (UK implementation, Article 32)
- **ISO 27001** (information security)
---

**Last updated:** 2026-07-27
