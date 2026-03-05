/**
 * OTP endpoints — TanStack Start (server functions / API routes)
 *
 * TanStack Start uses createServerFn() for type-safe server functions.
 * This example shows both the server function approach and an API route approach.
 *
 * Install in your TanStack Start project:
 *   npm install kwtsms bcryptjs
 *
 * Files to create:
 *   app/server/otp.ts          ← server functions (this file)
 *   app/routes/api/send-otp.ts ← API route (alternative approach)
 *
 * Environment variables (.env):
 *   KWTSMS_USERNAME=your_username
 *   KWTSMS_PASSWORD=your_password
 *   KWTSMS_SENDER_ID=YOUR-APP
 *   KWTSMS_LOG_FILE=
 */

import { createServerFn } from '@tanstack/start';
import { getWebRequest } from '@tanstack/start/server';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// import { createTurnstileVerifier } from '../captcha/turnstile.js';

const sms = KwtSMS.fromEnv();
const store = createMemoryStore();

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(process.env.TURNSTILE_SECRET!),
});

function getClientIp(): string {
  const req = getWebRequest();
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

// ── Server functions ──────────────────────────────────────────────────────────

// NOTE: createServerFn() does not set HTTP response status codes.
// The returned result object is serialised and sent as 200 OK.
// Check result.success and result.retryAfter on the CLIENT side:
//   const result = await sendOtpFn({ data: { phone } });
//   if (!result.success && result.retryAfter) { /* show retry message */ }
export const sendOtpFn = createServerFn({ method: 'POST' })
  .validator((data: { phone: unknown; captchaToken?: string }) => data)
  .handler(async ({ data }) => {
    const ip = getClientIp();
    return otp.sendOtp(data.phone, data.captchaToken, ip);
  });

export const verifyOtpFn = createServerFn({ method: 'POST' })
  .validator((data: { phone: unknown; code: unknown }) => data)
  .handler(async ({ data }) => {
    const ip = getClientIp();
    return otp.verifyOtp(data.phone, data.code, ip);
  });

// ── Usage in your component ───────────────────────────────────────────────────
//
// import { sendOtpFn, verifyOtpFn } from '~/server/otp';
//
// // Send OTP:
// const result = await sendOtpFn({ data: { phone: '+96598765432' } });
//
// // Verify OTP:
// const result = await verifyOtpFn({ data: { phone: '+96598765432', code: '123456' } });
