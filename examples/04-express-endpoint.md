# Example 04: Express.js OTP Endpoint

A production-ready HTTP API for OTP send and verify, with rate limiting, CAPTCHA, and proper error handling.

## What This Covers

- `POST /auth/send-otp` — validate, rate-limit, send OTP
- `POST /auth/verify-otp` — verify submitted code with expiry and replay protection
- Per-phone rate limiting (3 sends/hour)
- Per-IP rate limiting (10 sends/hour)
- 4-minute resend cooldown
- CAPTCHA verification placeholder

## Run

```bash
npx tsx examples/04-express-endpoint.ts
```

Test with curl:

```bash
# Send OTP
curl -X POST http://localhost:3000/auth/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"96598765432","captchaToken":"test123"}'

# Verify OTP (replace 123456 with the actual code)
curl -X POST http://localhost:3000/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"96598765432","code":"123456"}'
```

## Express.js Integration

The example uses `node:http` so it runs standalone without installing Express. For a real Express project:

```bash
npm install express
npm install --save-dev @types/express
```

```typescript
import express from 'express';
import { KwtSMS } from 'kwtsms';
import { randomInt } from 'node:crypto';

const app = express();
app.use(express.json());

const sms = KwtSMS.fromEnv();

app.post('/auth/send-otp', async (req, res) => {
  const { phone, captchaToken } = req.body;

  // validate, captcha, rate limit, then:
  const code = String(randomInt(100_000, 1_000_000));
  const result = await sms.send(phone, `Your code for MYAPP is: ${code}`);

  if (result.result !== 'OK') {
    return res.status(500).json({ error: 'Failed to send code' });
  }

  // store { code, expiresAt, resendAllowedAt, used } in Redis/DB
  return res.json({ success: true });
});

app.post('/auth/verify-otp', async (req, res) => {
  const { phone, code } = req.body;
  // fetch from Redis/DB, verify, mark used
  return res.json({ success: true });
});
```

## Security Layers

### 1. CAPTCHA (first line of defense)

```typescript
// Replace with your CAPTCHA provider
async function verifyCaptcha(token: string): Promise<boolean> {
  // hCaptcha example:
  const response = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${process.env.HCAPTCHA_SECRET}&response=${token}`,
  });
  const data = await response.json();
  return data.success === true;
}
```

CAPTCHA must be verified **before** any SMS is sent. Without CAPTCHA, bots can drain your entire balance in minutes.

### 2. Per-phone rate limiting

```typescript
// Max 3 OTP requests per phone per hour
const phoneRateLimit = new Map<string, number[]>();

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const window = now - 3600_000;
  const hits = (phoneRateLimit.get(phone) ?? []).filter(t => t > window);
  if (hits.length >= 3) return true;
  hits.push(now);
  phoneRateLimit.set(phone, hits);
  return false;
}
```

### 3. Per-IP rate limiting

Same pattern as phone rate limiting, using `req.socket.remoteAddress` (or `req.ip` in Express with trust proxy enabled).

For load-balanced deployments, use Redis for shared rate limit state across instances.

### 4. Resend cooldown

```typescript
// 4-minute minimum between sends to the same number
if (now < existing.resendAllowedAt) {
  const retryAfter = Math.ceil((existing.resendAllowedAt - now) / 1000);
  return res.status(429).json({ error: 'Please wait', retryAfter });
}
```

Return `retryAfter` in seconds so the client can show a countdown timer.

## Response Format

### Success: POST /auth/send-otp

```json
{ "success": true, "resendIn": 240 }
```

### Error: rate limited

```json
{ "error": "Too many OTP requests for this number. Try again in an hour.", "retryAfter": 3600 }
```

HTTP status `429 Too Many Requests`. Use `retryAfter` for the countdown timer.

### Success: POST /auth/verify-otp

```json
{ "success": true }
```

### Error: wrong code

```json
{ "error": "Incorrect verification code" }
```

HTTP status `400`.

## Error Handling Principles

- Never expose internal error codes (`ERR003`, `ERR010`) to API clients — log them server-side only
- Return generic user-facing messages (`"Failed to send verification code"`) for unexpected errors
- Always log the masked phone (first 5 digits + `***`) for debugging
- Use HTTP 429 for rate limit errors, always include `retryAfter`
- Use HTTP 400 for bad input (wrong code, expired, already used)

## Production Checklist

- [ ] Replace `node:http` with Express, Fastify, or your framework
- [ ] Replace in-memory stores with Redis (rate limits, OTP records)
- [ ] Implement real CAPTCHA (hCaptcha, reCAPTCHA, Cloudflare Turnstile)
- [ ] Add `trust proxy` config if behind a load balancer (`app.set('trust proxy', 1)`)
- [ ] Use a Transactional sender ID for OTP (not `KWT-SMS`)
- [ ] Set `KWTSMS_TEST_MODE=0` in production `.env`
- [ ] Add request logging middleware
- [ ] Add error monitoring (Sentry, etc.)
