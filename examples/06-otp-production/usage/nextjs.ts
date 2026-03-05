/**
 * OTP endpoints — Next.js App Router (route handlers)
 *
 * Copy these files into your Next.js project:
 *   app/api/auth/send-otp/route.ts   ← contents of sendOtpHandler below
 *   app/api/auth/verify-otp/route.ts ← contents of verifyOtpHandler below
 *
 * Also copy to your project root:
 *   lib/otp.ts ← shared service instance (see bottom of this file)
 *
 * Install kwtsms in your Next.js project:
 *   npm install kwtsms bcryptjs
 *
 * Environment variables (add to .env.local):
 *   KWTSMS_USERNAME=your_username
 *   KWTSMS_PASSWORD=your_password
 *   KWTSMS_SENDER_ID=YOUR-APP
 *   KWTSMS_LOG_FILE=          # leave empty for OTP (message bodies contain codes)
 *   TURNSTILE_SECRET=your_secret  # optional
 */

import { NextRequest, NextResponse } from 'next/server';
import { createOtpService } from 'kwtsms/examples/06-otp-production/otp-service.js';
import { createMemoryStore } from 'kwtsms/examples/06-otp-production/adapters/memory.js';
import { KwtSMS } from 'kwtsms';
// import { createTurnstileVerifier } from 'kwtsms/examples/06-otp-production/captcha/turnstile.js';

// ── lib/otp.ts — shared service instance ─────────────────────────────────────
// In your Next.js project, put this in lib/otp.ts and import from there.

const sms = KwtSMS.fromEnv();
const store = createMemoryStore(); // or createSQLiteStore / createDrizzleStore / createPrismaStore

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(process.env.TURNSTILE_SECRET!),
});

// ── app/api/auth/send-otp/route.ts ───────────────────────────────────────────

export async function sendOtpHandler(request: NextRequest): Promise<NextResponse> {
  // Get real client IP (Next.js on Vercel/Cloudflare sets x-forwarded-for)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  let body: { phone?: unknown; captchaToken?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await otp.sendOtp(body.phone, body.captchaToken, ip);
  return NextResponse.json(result, { status: result.success ? 200 : result.retryAfter ? 429 : 400 });
}

// ── app/api/auth/verify-otp/route.ts ─────────────────────────────────────────

export async function verifyOtpHandler(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  let body: { phone?: unknown; code?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await otp.verifyOtp(body.phone, body.code, ip);

  if (result.success) {
    // User is verified. Set session cookie / return JWT here.
    return NextResponse.json({ success: true });
  }
  return NextResponse.json(result, { status: result.retryAfter ? 429 : 400 });
}

// ── How to use in your Next.js project ───────────────────────────────────────
//
// Each handler goes in its own route file:
//
// app/api/auth/send-otp/route.ts:
//   export { sendOtpHandler as POST };
//
// app/api/auth/verify-otp/route.ts:
//   export { verifyOtpHandler as POST };
//
// (Do NOT put both in the same file — each route needs its own route.ts)

// For send-otp route file (app/api/auth/send-otp/route.ts):
export { sendOtpHandler as POST };
