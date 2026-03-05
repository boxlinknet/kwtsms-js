# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Email **security@kwtsms.com** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 48 hours. If the issue is confirmed, a patch will be released as soon as possible.

## Scope

This library makes HTTPS requests to the kwtSMS API. Key security properties:
- API credentials are never logged (password is a private class field, masked in all log output)
- No eval, no dynamic code execution
- Zero runtime dependencies
- All outbound requests use `node:https` (TLS 1.2+ enforced by Node.js)
