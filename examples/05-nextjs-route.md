# Example 05: Next.js App Router API Route

Drop-in OTP route handlers for Next.js 13+ App Router (Route Handlers).

## File Structure

```
app/
  api/
    auth/
      send-otp/
        route.ts        ← POST /api/auth/send-otp
      verify-otp/
        route.ts        ← POST /api/auth/verify-otp
lib/
  sms.ts                ← shared KwtSMS singleton
  otp.ts                ← OTP store (swap for Redis)
```

## Install

```bash
npm install kwtsms
```

No other runtime dependencies — kwtsms uses only Node.js built-ins.

## Environment Variables

Add to `.env.local` (Next.js loads this automatically, never commit it):

```
KWTSMS_USERNAME=your_api_username
KWTSMS_PASSWORD=your_api_password
KWTSMS_SENDER_ID=MYAPP
KWTSMS_TEST_MODE=1
```

Set `KWTSMS_TEST_MODE=0` before deploying to production.

## Shared Singleton: lib/sms.ts

```typescript
// lib/sms.ts
import { KwtSMS } from 'kwtsms';

// Module-level singleton — safe to share across requests
// Do NOT instantiate inside route handlers (re-reads .env every request)
export const sms = KwtSMS.fromEnv();
```

## OTP Store: lib/otp.ts

```typescript
// lib/otp.ts
// Replace with Redis (ioredis or @upstash/redis) in production.
// In-process Map is lost on restart and doesn't work with multiple instances.

interface OtpRecord {
  code: string;
  expiresAt: number;       // unix ms
  resendAllowedAt: number; // unix ms
  used: boolean;
}

const store = new Map<string, OtpRecord>();

export function setOtp(phone: string, code: string, ttlMs: number, cooldownMs: number): void {
  const now = Date.now();
  store.set(phone, {
    code,
    expiresAt: now + ttlMs,
    resendAllowedAt: now + cooldownMs,
    used: false,
  });
}

export function getOtp(phone: string): OtpRecord | undefined {
  return store.get(phone);
}

export function deleteOtp(phone: string): void {
  store.delete(phone);
}
```

## Route: POST /api/auth/send-otp

```typescript
// app/api/auth/send-otp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sms } from '@/lib/sms';
import { setOtp, getOtp } from '@/lib/otp';
import { randomInt } from 'node:crypto';

const OTP_TTL_MS = 5 * 60 * 1000;         // 5 minutes
const RESEND_COOLDOWN_MS = 4 * 60 * 1000; // 4 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, captchaToken } = body;

    // 1. Validate input
    if (!phone || !captchaToken) {
      return NextResponse.json(
        { error: 'phone and captchaToken are required' },
        { status: 400 }
      );
    }

    // 2. Verify CAPTCHA (see CAPTCHA section below)
    const captchaOk = await verifyCaptcha(captchaToken);
    if (!captchaOk) {
      return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 });
    }

    // 3. Resend cooldown
    const existing = getOtp(phone);
    const now = Date.now();
    if (existing && now < existing.resendAllowedAt) {
      const retryAfter = Math.ceil((existing.resendAllowedAt - now) / 1000);
      return NextResponse.json(
        { error: 'Please wait before requesting a new code', retryAfter },
        { status: 429 }
      );
    }

    // 4. Send OTP
    const code = String(randomInt(100_000, 1_000_000));
    const result = await sms.send(phone, `Your verification code for MYAPP is: ${code}`);

    if (result.result !== 'OK') {
      console.error('[OTP] Send failed:', result.code, result.description);
      return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 });
    }

    // 5. Store OTP
    setOtp(phone, code, OTP_TTL_MS, RESEND_COOLDOWN_MS);

    return NextResponse.json({
      success: true,
      resendIn: Math.ceil(RESEND_COOLDOWN_MS / 1000), // seconds
    });
  } catch (error) {
    console.error('[OTP] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Route: POST /api/auth/verify-otp

```typescript
// app/api/auth/verify-otp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getOtp, deleteOtp } from '@/lib/otp';

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json();

    if (!phone || !code) {
      return NextResponse.json({ error: 'phone and code are required' }, { status: 400 });
    }

    const record = getOtp(phone);
    const now = Date.now();

    if (!record) {
      return NextResponse.json(
        { error: 'No pending verification for this number' },
        { status: 400 }
      );
    }
    if (record.used) {
      return NextResponse.json(
        { error: 'Code already used — request a new one' },
        { status: 400 }
      );
    }
    if (now > record.expiresAt) {
      deleteOtp(phone);
      return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 });
    }
    if (code.trim() !== record.code) {
      return NextResponse.json({ error: 'Incorrect verification code' }, { status: 400 });
    }

    // Mark used before returning
    record.used = true;

    // Issue session token here (iron-session, NextAuth, etc.)
    // const token = await createSession(phone);
    // return NextResponse.json({ success: true, token });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OTP] Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## CAPTCHA Integration

```typescript
// Cloudflare Turnstile (recommended — free)
async function verifyCaptcha(token: string): Promise<boolean> {
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    }
  );
  const data = await res.json();
  return data.success === true;
}

// hCaptcha
async function verifyHCaptcha(token: string): Promise<boolean> {
  const params = new URLSearchParams({
    secret: process.env.HCAPTCHA_SECRET_KEY!,
    response: token,
  });
  const res = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  return data.success === true;
}
```

## Client-Side (React component)

```tsx
// components/OtpForm.tsx
'use client';

import { useState } from 'react';

export default function OtpForm({ phone }: { phone: string }) {
  const [step, setStep] = useState<'send' | 'verify'>('send');
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState('');

  async function sendOtp() {
    const captchaToken = 'your-captcha-token'; // get from your CAPTCHA widget
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, captchaToken }),
    });
    const data = await res.json();
    if (res.ok) {
      setStep('verify');
      setResendIn(data.resendIn); // start countdown timer
    } else {
      setError(data.error);
    }
  }

  async function verifyOtp() {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const data = await res.json();
    if (res.ok) {
      // User verified — redirect or update auth state
    } else {
      setError(data.error);
    }
  }

  if (step === 'send') {
    return <button onClick={sendOtp}>Send verification code</button>;
  }

  return (
    <div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter 6-digit code"
        maxLength={6}
      />
      <button onClick={verifyOtp}>Verify</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {resendIn > 0 && <p>Resend in {resendIn}s</p>}
    </div>
  );
}
```

## Production Checklist

- [ ] Move OTP store from `Map` to Redis (`@upstash/redis` works well with Vercel)
- [ ] Add rate limiting middleware (use `@upstash/ratelimit` with Redis for serverless)
- [ ] Implement real CAPTCHA (Turnstile, hCaptcha, reCAPTCHA)
- [ ] Use a Transactional sender ID for OTP (not `KWT-SMS`)
- [ ] Set `KWTSMS_TEST_MODE=0` in production environment variables
- [ ] Add `KWTSMS_*` env vars to Vercel/Netlify/your host dashboard
- [ ] Test locally with `npm run dev` and real credentials in `.env.local`

## Notes on Serverless/Edge

- The `kwtsms` package uses `node:https` — it runs on Node.js runtime only
- For Vercel: set `export const runtime = 'nodejs'` (or omit — Node.js is the default for App Router)
- For Vercel Edge Functions: not supported (no `node:https`); use Node.js runtime
- The `KwtSMS.fromEnv()` call at module level is safe — Next.js evaluates this once per cold start

## Testing

With `KWTSMS_TEST_MODE=1`, messages are queued but never delivered. No credits consumed. Use this during development.

```bash
# Start Next.js
npm run dev

# Test with curl
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"96598765432","captchaToken":"test"}'
```
