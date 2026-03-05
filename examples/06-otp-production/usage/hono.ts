/**
 * OTP endpoints — Hono
 *
 * Hono runs on Node.js, Bun, Cloudflare Workers, and other edge runtimes.
 * Note: kwtSMS uses node:https — it works on Node.js and Bun.
 * For Cloudflare Workers, you would need a different HTTP client.
 *
 * Install:
 *   npm install hono @hono/node-server
 *
 * Routes:
 *   POST /auth/send-otp    body: { phone, captchaToken? }
 *   POST /auth/verify-otp  body: { phone, code }
 *
 * Run:
 *   npx tsx examples/06-otp-production/usage/hono.ts
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// import { createTurnstileVerifier } from '../captcha/turnstile.js';

const app = new Hono();

const sms = KwtSMS.fromEnv();
const store = createMemoryStore();

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(process.env.TURNSTILE_SECRET!),
});

app.post('/auth/send-otp', async (c) => {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
    c.req.header('x-real-ip') ??
    '127.0.0.1';

  let body: { phone?: unknown; captchaToken?: string };
  try {
    body = await c.req.json() as typeof body;
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await otp.sendOtp(body.phone, body.captchaToken, ip);
  return c.json(result, result.success ? 200 : result.retryAfter ? 429 : 400);
});

app.post('/auth/verify-otp', async (c) => {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
    c.req.header('x-real-ip') ??
    '127.0.0.1';

  let body: { phone?: unknown; code?: unknown };
  try {
    body = await c.req.json() as typeof body;
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await otp.verifyOtp(body.phone, body.code, ip);

  if (result.success) {
    return c.json({ success: true });
  }
  return c.json(result, result.retryAfter ? 429 : 400);
});

serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log('OTP server running on http://localhost:3000');
});
