/**
 * OTP endpoints — Astro (API Routes)
 *
 * Astro API routes live in src/pages/api/*.ts and export GET, POST, etc.
 *
 * Install in your Astro project:
 *   npm install kwtsms bcryptjs
 *
 * Files to create in your Astro project:
 *   src/pages/api/auth/send-otp.ts   ← see sendOtp export below
 *   src/pages/api/auth/verify-otp.ts ← see verifyOtp export below
 *
 * astro.config.mjs must have output: 'server' or 'hybrid':
 *   export default defineConfig({ output: 'server', adapter: node() });
 *
 * Environment variables (.env):
 *   KWTSMS_USERNAME=your_username
 *   KWTSMS_PASSWORD=your_password
 *   KWTSMS_SENDER_ID=YOUR-APP
 *   KWTSMS_LOG_FILE=
 */

import type { APIRoute } from 'astro';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// import { createTurnstileVerifier } from '../captcha/turnstile.js';

// ── Shared service (create once, reuse across requests) ───────────────────────
// In your project: put this in src/lib/otp.ts and import from there.

const sms = KwtSMS.fromEnv();
const store = createMemoryStore();

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(import.meta.env.TURNSTILE_SECRET),
});

// ── src/pages/api/auth/send-otp.ts ───────────────────────────────────────────

export const sendOtp: APIRoute = async ({ request, clientAddress }) => {
  let body: { phone?: unknown; captchaToken?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Astro provides clientAddress directly — no need to parse headers manually
  const result = await otp.sendOtp(body.phone, body.captchaToken, clientAddress);
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : result.retryAfter ? 429 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ── src/pages/api/auth/verify-otp.ts ─────────────────────────────────────────

export const verifyOtp: APIRoute = async ({ request, clientAddress }) => {
  let body: { phone?: unknown; code?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await otp.verifyOtp(body.phone, body.code, clientAddress);
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : result.retryAfter ? 429 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
