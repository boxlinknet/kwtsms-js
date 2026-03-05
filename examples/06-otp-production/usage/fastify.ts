/**
 * OTP endpoints — Fastify
 *
 * Install:
 *   npm install fastify
 *
 * Routes:
 *   POST /auth/send-otp    body: { phone, captchaToken? }
 *   POST /auth/verify-otp  body: { phone, code }
 *
 * Run:
 *   npx tsx examples/06-otp-production/usage/fastify.ts
 */

import Fastify from 'fastify';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// import { createSQLiteStore } from '../adapters/sqlite.js';
// import { createTurnstileVerifier } from '../captcha/turnstile.js';

const fastify = Fastify({ logger: true });

// IMPORTANT: If behind a reverse proxy (nginx, Cloudflare), add:
// const fastify = Fastify({ logger: true, trustProxy: true });
// This makes request.ip return the real client IP.

const sms = KwtSMS.fromEnv();
const store = createMemoryStore();

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(process.env.TURNSTILE_SECRET!),
});

fastify.post('/auth/send-otp', async (request, reply) => {
  const { phone, captchaToken } = request.body as { phone: unknown; captchaToken?: string };
  const ip = request.ip;

  const result = await otp.sendOtp(phone, captchaToken, ip);
  return reply.status(result.success ? 200 : result.retryAfter ? 429 : 400).send(result);
});

fastify.post('/auth/verify-otp', async (request, reply) => {
  const { phone, code } = request.body as { phone: unknown; code: unknown };
  const ip = request.ip;

  const result = await otp.verifyOtp(phone, code, ip);

  if (result.success) {
    // User is verified. Issue JWT / set session here.
    return reply.send({ success: true });
  }
  return reply.status(result.retryAfter ? 429 : 400).send(result);
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log('OTP server running on http://localhost:3000');
});
