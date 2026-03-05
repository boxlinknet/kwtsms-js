/**
 * Example 05: Next.js App Router API Route
 *
 * Drop-in OTP route handlers for Next.js 13+ App Router.
 *
 * File locations in your Next.js project:
 *   app/api/auth/send-otp/route.ts     — copy from handleSendOtp below
 *   app/api/auth/verify-otp/route.ts   — copy from handleVerifyOtp below
 *
 * Dependencies (not included in kwtsms):
 *   The kwtsms package itself — zero other runtime deps needed
 *
 * Next.js version: 13.4+ (App Router, Route Handlers)
 *
 * This file is a reference — it cannot be run directly.
 * Copy the relevant handlers into your Next.js project.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
// In your Next.js project these are available without installing anything extra:
// import { NextRequest, NextResponse } from 'next/server';

import { KwtSMS } from '../src/index.js';
import { randomInt } from 'node:crypto';

// ── Shared setup (move to lib/sms.ts in your project) ────────────────────────
//
// Keep the KwtSMS instance as a module-level singleton.
// It is safe to share across requests — it holds no per-request state.
//
// Do NOT call KwtSMS.fromEnv() inside the route handler — that would re-read
// the .env file on every request.

const sms = KwtSMS.fromEnv();

// ── In-memory OTP store (replace with Redis in production) ───────────────────
interface OtpRecord {
  code: string;
  expiresAt: number;
  resendAllowedAt: number;
  used: boolean;
}

// In your project: use 'ioredis' or '@upstash/redis' instead
const otpStore = new Map<string, OtpRecord>();

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 4 * 60 * 1000;

function generateCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

// ── Route: POST /api/auth/send-otp ────────────────────────────────────────────
//
// Save this as: app/api/auth/send-otp/route.ts
//
// Replace the `NextRequest`/`NextResponse` type comments with real imports:
//   import { NextRequest, NextResponse } from 'next/server';

export async function POST_send_otp(
  // req: NextRequest  ← use in your Next.js project
  req: { json: () => Promise<Record<string, string>>; headers: { get: (h: string) => string | null } },
) {
  try {
    const body = await req.json();
    const phone = body.phone;
    const captchaToken = body.captchaToken;

    // 1. Validate required fields
    if (!phone || !captchaToken) {
      // return NextResponse.json({ error: 'phone and captchaToken are required' }, { status: 400 });
      return { status: 400, body: { error: 'phone and captchaToken are required' } };
    }

    // 2. Verify CAPTCHA (replace with your provider)
    // const captchaOk = await verifyHCaptcha(captchaToken);
    // if (!captchaOk) return NextResponse.json({ error: 'CAPTCHA failed' }, { status: 400 });

    // 3. Resend cooldown
    const existing = otpStore.get(phone);
    const now = Date.now();
    if (existing && now < existing.resendAllowedAt) {
      const retryAfter = Math.ceil((existing.resendAllowedAt - now) / 1000);
      // return NextResponse.json({ error: 'Please wait', retryAfter }, { status: 429 });
      return { status: 429, body: { error: 'Please wait', retryAfter } };
    }

    // 4. Send OTP
    const code = generateCode();
    const result = await sms.send(phone, `Your verification code for MYAPP is: ${code}`);

    if (result.result !== 'OK') {
      console.error('[OTP] Send failed:', result.code, result.description);
      // return NextResponse.json({ error: 'Failed to send code' }, { status: 500 });
      return { status: 500, body: { error: 'Failed to send code' } };
    }

    // 5. Persist OTP
    otpStore.set(phone, {
      code,
      expiresAt: now + OTP_TTL_MS,
      resendAllowedAt: now + RESEND_COOLDOWN_MS,
      used: false,
    });

    // return NextResponse.json({ success: true, resendIn: Math.ceil(RESEND_COOLDOWN_MS / 1000) });
    return { status: 200, body: { success: true, resendIn: Math.ceil(RESEND_COOLDOWN_MS / 1000) } };
  } catch (e) {
    console.error('[OTP] Unexpected error:', e);
    // return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    return { status: 500, body: { error: 'Internal server error' } };
  }
}

// ── Route: POST /api/auth/verify-otp ─────────────────────────────────────────
//
// Save this as: app/api/auth/verify-otp/route.ts

export async function POST_verify_otp(
  // req: NextRequest  ← use in your Next.js project
  req: { json: () => Promise<Record<string, string>> },
) {
  try {
    const body = await req.json();
    const { phone, code } = body;

    if (!phone || !code) {
      // return NextResponse.json({ error: 'phone and code are required' }, { status: 400 });
      return { status: 400, body: { error: 'phone and code are required' } };
    }

    const record = otpStore.get(phone);
    const now = Date.now();

    if (!record) {
      return { status: 400, body: { error: 'No pending verification for this number' } };
    }
    if (record.used) {
      return { status: 400, body: { error: 'Code already used — request a new one' } };
    }
    if (now > record.expiresAt) {
      otpStore.delete(phone);
      return { status: 400, body: { error: 'Code expired — request a new one' } };
    }
    if (code.trim() !== record.code) {
      return { status: 400, body: { error: 'Incorrect verification code' } };
    }

    record.used = true;

    // At this point the user is verified.
    // Issue a session token or JWT here and return it.
    // return NextResponse.json({ success: true, token: await createSessionToken(phone) });
    return { status: 200, body: { success: true } };
  } catch (e) {
    console.error('[OTP] Verify error:', e);
    return { status: 500, body: { error: 'Internal server error' } };
  }
}

// ── Demo output ───────────────────────────────────────────────────────────────
// Shows the expected handler responses when this file is run directly.

console.log('Next.js Route Handler Reference');
console.log('================================');
console.log('');
console.log('Copy the following into your Next.js project:');
console.log('');
console.log('  app/api/auth/send-otp/route.ts:');
console.log('    export async function POST(req: NextRequest) { ... }');
console.log('');
console.log('  app/api/auth/verify-otp/route.ts:');
console.log('    export async function POST(req: NextRequest) { ... }');
console.log('');
console.log('See examples/05-nextjs-route.md for the complete ready-to-paste code.');
