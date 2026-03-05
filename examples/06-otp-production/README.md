# Production OTP Flow with kwtSMS

A complete, production-ready SMS OTP implementation.
Drop-in adapters for any database. Framework wiring for 9 frameworks.

---

## How It Works

```
User enters phone number
        │
        ▼
1. Validate phone number locally       ← no SMS credit wasted on bad numbers
        │
        ▼
2. Verify CAPTCHA (if configured)      ← blocks bots before any DB/SMS work
        │
        ▼
3. Check rate limits                   ← per-IP (10/hr) + per-phone (3/hr)
        │
        ▼
4. Check resend cooldown               ← 4-minute minimum between sends
        │
        ▼
5. Generate 6-digit code (crypto.randomInt)
        │
        ▼
6. Hash code with bcrypt               ← DB leak won't expose codes
        │
        ▼
7. Save to database                    ← with 5-minute expiry
        │
        ▼
8. Send SMS via kwtSMS                 ← only after ALL checks pass

── User receives SMS, enters code ──

9. Validate phone + code input         ← type check, strip non-digits
        │
        ▼
10. Rate limit verify attempts         ← max 5/hr (brute-force guard)
        │
        ▼
11. Check: used? expired? >3 attempts?
        │
        ▼
12. bcrypt.compare (timing-safe)       ← wrong → increment attempts
        │                                correct → mark used, return success
        ▼
13. User is verified ✓                 ← issue JWT / create session
```

---

## Quick Start (5 minutes)

### 1. Install

```bash
npm install kwtsms bcryptjs
```

### 2. Set environment variables

```bash
# .env
KWTSMS_USERNAME=your_api_username
KWTSMS_PASSWORD=your_api_password
KWTSMS_SENDER_ID=YOUR-APP
KWTSMS_LOG_FILE=          # leave empty — OTP codes would be logged otherwise
```

### 3. Copy and initialize

```typescript
import { KwtSMS } from 'kwtsms';
import { createOtpService } from './otp-service.js';
import { createMemoryStore } from './adapters/memory.js';

const otp = createOtpService({
  sms: KwtSMS.fromEnv(),
  store: createMemoryStore(),   // swap for SQLite/Drizzle/Prisma in production
  appName: 'MyApp',
});
```

### 4. Wire up your routes

```typescript
// Send OTP
app.post('/auth/send-otp', async (req, res) => {
  const result = await otp.sendOtp(req.body.phone, req.body.captchaToken, req.ip);
  res.status(result.success ? 200 : 400).json(result);
});

// Verify OTP
app.post('/auth/verify-otp', async (req, res) => {
  const result = await otp.verifyOtp(req.body.phone, req.body.code, req.ip);
  if (result.success) {
    // Issue JWT / create session
  }
  res.status(result.success ? 200 : 400).json(result);
});
```

See `usage/` for copy-paste files for your framework.

---

## Input Validation: The Full Picture

Phone numbers go through 5 layers of validation before any SMS is sent:

| Step | What happens | Why |
|------|-------------|-----|
| Type check | Rejects non-strings (null, objects, arrays) | Prevents type confusion attacks |
| Length guard | Rejects > 30 characters | Prevents memory attacks |
| trim() | Strips surrounding whitespace | Copy-paste safety |
| normalizePhone() | Strips +/00 prefix, spaces, dashes, dots, brackets; converts Arabic-Indic digits (١٢٣ → 123) | Consistent format |
| validatePhoneInput() | Rejects emails, text, < 7 or > 15 digits | Catches invalid numbers before SMS send |

OTP codes go through 4 layers:

| Step | What happens | Why |
|------|-------------|-----|
| Type check | Rejects non-strings | Prevents type confusion |
| trim() | Strips surrounding whitespace | Copy-paste safety |
| Strip non-digits | "1 2 3 4 5 6" → "123456" | Handles autofill formatting |
| Length check | Must be exactly 6 digits | Prevents empty/partial codes |

---

## Database Setup

### Option A: In-memory (development / testing)

Zero setup. Data lost on restart. Not shared across instances.

```typescript
import { createMemoryStore } from './adapters/memory.js';
const store = createMemoryStore();
```

### Option B: SQLite (small to medium production apps)

Embedded database. Zero infrastructure. Single-server only.

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

```typescript
import { createSQLiteStore } from './adapters/sqlite.js';
const store = createSQLiteStore({ filename: './otp.db' });
// Tables created automatically on first use
```

### Option C: Drizzle ORM

Works with SQLite, PostgreSQL, MySQL. Pass in your existing Drizzle db instance.

```bash
npm install drizzle-orm
# Plus your DB driver: better-sqlite3, postgres, mysql2, etc.
```

Add to your schema.ts:
```typescript
export { otpRecords, otpRateLimits } from './adapters/drizzle.js';
```

Run migration:
```bash
npx drizzle-kit generate && npx drizzle-kit migrate
```

```typescript
import { createDrizzleStore } from './adapters/drizzle.js';
const store = createDrizzleStore({ db }); // pass your drizzle db instance
```

### Option D: Prisma

Works with any Prisma-supported database.

```bash
npm install @prisma/client
npm install --save-dev prisma
```

Add to your `schema.prisma` (see `adapters/prisma.ts` for the full schema snippet):

```prisma
model OtpRecord {
  phone           String  @id
  code            String
  expiresAt       Int
  resendAllowedAt Int
  attempts        Int     @default(0)
  used            Boolean @default(false)
  createdAt       Int
  ipAddress       String?
  @@map("otp_records")
}

model OtpRateLimit {
  key       String @id
  timestamps String
  updatedAt Int
  @@map("otp_rate_limits")
}
```

```bash
npx prisma migrate dev --name add_otp_tables
```

```typescript
import { PrismaClient } from '@prisma/client';
import { createPrismaStore } from './adapters/prisma.js';

const prisma = new PrismaClient();
const store = createPrismaStore({ prisma });
```

---

## CAPTCHA Setup

### Option A: No CAPTCHA (trusted clients / dev)

Omit the `captcha` option entirely.

```typescript
const otp = createOtpService({ sms, store, appName: 'MyApp' });
```

### Option B: Cloudflare Turnstile (recommended)

Free. Unlimited. Privacy-friendly. Works great in Kuwait/GCC.

**Get your keys (5 minutes):**
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Zero Trust → Turnstile
2. Click "Add site" → enter your domain
3. Copy **Site Key** (frontend) and **Secret Key** (backend)

**Add to your HTML:**
```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
```

**Read the token on form submit:**
```javascript
const token = document.querySelector('[name="cf-turnstile-response"]').value;
// Include in your fetch: { phone, captchaToken: token }
```

**Backend:**
```bash
TURNSTILE_SECRET=your_secret_key
```

```typescript
import { createTurnstileVerifier } from './captcha/turnstile.js';
const captcha = createTurnstileVerifier(process.env.TURNSTILE_SECRET!);
const otp = createOtpService({ sms, store, appName: 'MyApp', captcha });
```

### Option C: hCaptcha

Privacy-focused. GDPR-safe. Free tier: 1M verifications/month.

**Get your keys:**
1. Go to [dashboard.hcaptcha.com/signup](https://dashboard.hcaptcha.com/signup)
2. Create a new site
3. Copy **Site Key** and **Secret Key**

**Add to your HTML:**
```html
<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
<div class="h-captcha" data-sitekey="YOUR_SITE_KEY"></div>
```

**Read the token:**
```javascript
const token = document.querySelector('[name="h-captcha-response"]').value;
```

**Backend:**
```bash
HCAPTCHA_SECRET=your_secret_key
```

```typescript
import { createHCaptchaVerifier } from './captcha/hcaptcha.js';
const captcha = createHCaptchaVerifier(process.env.HCAPTCHA_SECRET!);
const otp = createOtpService({ sms, store, appName: 'MyApp', captcha });
```

---

## Rate Limiting

### How it works

Two-tier sliding window. Both tiers must pass.

| Tier | Storage | Survives restart | Multi-instance |
|------|---------|-----------------|---------------|
| In-memory | Map<string, number[]> | No | No (per-process) |
| DB-backed | otp_rate_limits table | Yes | Yes (shared) |

**Limits:**

| What | Window | Max |
|------|--------|-----|
| Sends per IP | 1 hour | 10 |
| Sends per phone | 1 hour | 3 |
| Verify attempts per phone | 1 hour | 5 |
| Resend cooldown | — | 4 minutes |

### Default: in-memory

Works out of the box. Resets on server restart. Fine for single-process apps.

### Production: DB-backed

Enabled automatically when your adapter implements `getRateLimit/setRateLimit`.
SQLite, Drizzle, and Prisma adapters all implement it.

```typescript
// Just use any adapter other than memory — DB rate limiting is automatic
const store = createSQLiteStore({ filename: './otp.db' });
const otp = createOtpService({ sms, store, appName: 'MyApp' });
// DB-backed rate limits now active — survives restarts, works across instances
```

---

## Framework Wiring

| Framework | File | IP extraction |
|-----------|------|--------------|
| Node.js (node:http) | `usage/node-http.ts` | `x-forwarded-for` header / `req.socket.remoteAddress` |
| Express.js | `usage/express.ts` | `req.ip` (set `trust proxy` behind load balancer) |
| Fastify | `usage/fastify.ts` | `request.ip` (set `trustProxy: true` behind load balancer) |
| Next.js App Router | `usage/nextjs.ts` | `x-forwarded-for` header |
| Hono | `usage/hono.ts` | `x-forwarded-for` / `x-real-ip` header |
| NestJS | `usage/nestjs.ts` | `x-forwarded-for` header / `req.socket.remoteAddress` |
| TanStack Start | `usage/tanstack.ts` | `getWebRequest()` headers |
| Astro | `usage/astro.ts` | `clientAddress` (built-in, handles proxies) |
| SvelteKit | `usage/sveltekit.ts` | `getClientAddress()` (built-in, handles proxies) |

---

## Environment Variables

```bash
# Required — kwtSMS credentials
KWTSMS_USERNAME=your_api_username
KWTSMS_PASSWORD=your_api_password
KWTSMS_SENDER_ID=YOUR-APP

# IMPORTANT for OTP: disable logging (OTP codes appear in message bodies)
KWTSMS_LOG_FILE=

# Optional — CAPTCHA (pick one)
TURNSTILE_SECRET=your_cloudflare_turnstile_secret
HCAPTCHA_SECRET=your_hcaptcha_secret
```

---

## Security Checklist

Before going live, confirm:

- [ ] `KWTSMS_LOG_FILE=` (empty): OTP codes must NOT be logged
- [ ] CAPTCHA enabled in production (`TURNSTILE_SECRET` or `HCAPTCHA_SECRET` set)
- [ ] `trust proxy` configured correctly if behind nginx/Cloudflare (Express/Fastify)
- [ ] `.env` file has `chmod 600` permissions
- [ ] Using SQLite/Drizzle/Prisma adapter (not memory) in production
- [ ] OTP codes are hashed: verify `bcrypt.compare` is used, not `===`
- [ ] `appName` set to your real app name (telecom compliance)
- [ ] `KWTSMS_TEST_MODE=0` in production (live mode)
- [ ] Running on HTTPS in production (tokens interceptable over HTTP)

---

## Common Mistakes

### ❌ Logging OTP codes

```bash
# Wrong — OTP codes will appear in kwtsms.log
KWTSMS_LOG_FILE=kwtsms.log

# Correct — disable logging for OTP use cases
KWTSMS_LOG_FILE=
```

### ❌ Using raw phone as session/store key

```typescript
// Wrong — '+96598765432' and '96598765432' are treated as different users
otpStore.set(phone, record);

// Correct — normalizePhone() is called internally, but use it in YOUR code too
import { normalizePhone } from 'kwtsms';
session.userId = normalizePhone(phone);
```

### ❌ Not setting trust proxy (Express/Fastify)

```typescript
// Wrong — req.ip returns nginx/Cloudflare IP, breaking IP rate limiting
const app = express();

// Correct — tells Express to trust the X-Forwarded-For header
const app = express();
app.set('trust proxy', 1);
```

### ❌ Comparing codes with === instead of bcrypt

```typescript
// Wrong — timing attack possible + plain text stored
if (stored.code === userInput) { ... }

// Correct — this library handles it internally via bcrypt.compare
// Just call verifyOtp() — never compare codes yourself
```

### ❌ Sending SMS before all checks pass

```typescript
// Wrong — sends SMS even if rate limited
await sms.send(phone, message);
await checkRateLimit(...);

// Correct — all checks run first (this library handles it)
const result = await otp.sendOtp(phone, captchaToken, ip);
```
