/**
 * OTP endpoints — Express.js
 *
 * Install:
 *   npm install express
 *   npm install --save-dev @types/express
 *
 * Routes:
 *   POST /auth/send-otp    body: { phone, captchaToken? }
 *   POST /auth/verify-otp  body: { phone, code }
 *
 * Run:
 *   npx tsx examples/06-otp-production/usage/express.ts
 */

import express from 'express';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// import { createSQLiteStore } from '../adapters/sqlite.js';
// import { createTurnstileVerifier } from '../captcha/turnstile.js';

const app = express();
app.use(express.json());

// IMPORTANT: Set trust proxy if behind a load balancer/reverse proxy (nginx, Cloudflare, etc.)
// Without this, req.ip returns the proxy IP, breaking IP rate limiting.
// app.set('trust proxy', 1);      // trust first proxy
// app.set('trust proxy', 'loopback'); // trust loopback interface

const sms = KwtSMS.fromEnv();
const store = createMemoryStore();
// const store = createSQLiteStore({ filename: './otp.db' });

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(process.env.TURNSTILE_SECRET!),
});

// POST /auth/send-otp
app.post('/auth/send-otp', async (req, res) => {
  const { phone, captchaToken } = req.body as { phone: unknown; captchaToken?: string };
  const ip = req.ip ?? req.socket.remoteAddress ?? '127.0.0.1';

  const result = await otp.sendOtp(phone, captchaToken, ip);
  res.status(result.success ? 200 : result.retryAfter ? 429 : 400).json(result);
});

// POST /auth/verify-otp
app.post('/auth/verify-otp', async (req, res) => {
  const { phone, code } = req.body as { phone: unknown; code: unknown };
  const ip = req.ip ?? req.socket.remoteAddress ?? '127.0.0.1';

  const result = await otp.verifyOtp(phone, code, ip);

  if (result.success) {
    // User is verified. Create session / issue JWT here:
    // req.session.userId = ...
    // const token = jwt.sign({ phone }, process.env.JWT_SECRET!);
    res.json({ success: true });
  } else {
    res.status(result.retryAfter ? 429 : 400).json(result);
  }
});

app.listen(3000, () => {
  console.log('OTP server running on http://localhost:3000');
});
