/**
 * OTP endpoints — SvelteKit (+server.ts route handlers)
 *
 * SvelteKit API routes are +server.ts files that export HTTP method handlers.
 *
 * Install in your SvelteKit project:
 *   npm install kwtsms bcryptjs
 *
 * Files to create in your SvelteKit project:
 *   src/routes/api/auth/send-otp/+server.ts   ← see POST export below
 *   src/routes/api/auth/verify-otp/+server.ts ← see POST export below
 *   src/lib/otp.ts                             ← shared service
 *
 * Environment variables (.env):
 *   KWTSMS_USERNAME=your_username
 *   KWTSMS_PASSWORD=your_password
 *   KWTSMS_SENDER_ID=YOUR-APP
 *   KWTSMS_LOG_FILE=
 *   TURNSTILE_SECRET=your_secret (optional)
 *
 * Access env vars in SvelteKit: import { KWTSMS_USERNAME } from '$env/static/private';
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// import { createTurnstileVerifier } from '../captcha/turnstile.js';

// ── src/lib/otp.ts — shared service ──────────────────────────────────────────

const sms = KwtSMS.fromEnv();
const store = createMemoryStore();

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(TURNSTILE_SECRET),
});

// ── src/routes/api/auth/send-otp/+server.ts ──────────────────────────────────

export const sendOtpPOST: RequestHandler = async ({ request, getClientAddress }) => {
  // SvelteKit provides getClientAddress() — handles proxy headers automatically
  const ip = getClientAddress();

  let body: { phone?: unknown; captchaToken?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await otp.sendOtp(body.phone, body.captchaToken, ip);
  return json(result, { status: result.success ? 200 : result.retryAfter ? 429 : 400 });
};

// ── src/routes/api/auth/verify-otp/+server.ts ────────────────────────────────

export const verifyOtpPOST: RequestHandler = async ({ request, getClientAddress }) => {
  const ip = getClientAddress();

  let body: { phone?: unknown; code?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await otp.verifyOtp(body.phone, body.code, ip);

  if (result.success) {
    // Set session cookie here using SvelteKit cookies API:
    // cookies.set('session', createSession(phone), { path: '/', httpOnly: true });
    return json({ success: true });
  }
  return json(result, { status: result.retryAfter ? 429 : 400 });
};

// Export as SvelteKit route handlers (rename in your project):
export { sendOtpPOST as POST };
