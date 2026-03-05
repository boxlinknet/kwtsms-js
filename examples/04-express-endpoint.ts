/**
 * Example 04: Express.js OTP Endpoint
 *
 * A production-ready Express API with:
 *   - POST /auth/send-otp   — send a 6-digit code to a phone
 *   - POST /auth/verify-otp — verify the submitted code
 *   - Per-phone rate limiting (3 sends/hour)
 *   - Per-IP rate limiting (10 sends/hour)
 *   - CAPTCHA placeholder (swap in your provider)
 *   - Proper error response format
 *
 * Dependencies (not included in kwtsms — add to your project):
 *   npm install express
 *   npm install --save-dev @types/express
 *
 * Run:
 *   npx tsx examples/04-express-endpoint.ts
 */

import http from 'node:http';
import { KwtSMS } from '../src/index.js';
import { randomInt } from 'node:crypto';

// ── Lightweight HTTP server using node:http (no Express dependency needed here)
// For real projects: replace with Express, Fastify, or your framework of choice.
// The logic below maps 1:1 to Express — just swap `req.body` and `res.json()`.

const sms = KwtSMS.fromEnv();

// ── In-memory stores (use Redis + a DB in production) ─────────────────────────
interface OtpRecord {
  code: string;
  expiresAt: number;
  resendAllowedAt: number;
  used: boolean;
}
const otpStore = new Map<string, OtpRecord>();

// Rate limit counters — { key: [timestamps of recent requests] }
const phoneRateLimit = new Map<string, number[]>();
const ipRateLimit = new Map<string, number[]>();

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 4 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_PHONE = 3;               // per hour
const MAX_PER_IP = 10;                 // per hour

// ── Rate limiter helper ───────────────────────────────────────────────────────
function isRateLimited(store: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const window = now - RATE_WINDOW_MS;
  const hits = (store.get(key) ?? []).filter((t) => t > window);
  if (hits.length >= max) return true;
  hits.push(now);
  store.set(key, hits);
  return false;
}

// ── CAPTCHA verification placeholder ─────────────────────────────────────────
// Replace with your CAPTCHA provider (hCaptcha, reCAPTCHA v3, Turnstile, etc.)
async function verifyCaptcha(_token: string): Promise<boolean> {
  // TODO: call your CAPTCHA verification API here
  // For now, accept any non-empty token
  return _token.length > 0;
}

// ── OTP helpers ───────────────────────────────────────────────────────────────
function generateCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

// ── Request/response types ────────────────────────────────────────────────────
interface SendOtpRequest {
  phone: string;
  captchaToken: string;
}

interface VerifyOtpRequest {
  phone: string;
  code: string;
}

interface ApiError {
  error: string;
  retryAfter?: number; // seconds, present on rate limit errors
}

// ── Route handlers ─────────────────────────────────────────────────────────────

async function handleSendOtp(
  body: SendOtpRequest,
  ip: string,
): Promise<{ status: number; body: object }> {
  const { phone, captchaToken } = body;

  // 1. Validate input
  if (!phone || typeof phone !== 'string') {
    return { status: 400, body: { error: 'phone is required' } };
  }
  if (!captchaToken) {
    return { status: 400, body: { error: 'captchaToken is required' } };
  }

  // 2. Verify CAPTCHA first (before any rate limit checks, to stop bots early)
  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) {
    return { status: 400, body: { error: 'CAPTCHA verification failed' } };
  }

  // 3. IP rate limit
  if (isRateLimited(ipRateLimit, ip, MAX_PER_IP)) {
    return { status: 429, body: { error: 'Too many requests from this IP', retryAfter: 3600 } as ApiError };
  }

  // 4. Phone rate limit
  if (isRateLimited(phoneRateLimit, phone, MAX_PER_PHONE)) {
    return { status: 429, body: { error: 'Too many OTP requests for this number. Try again in an hour.', retryAfter: 3600 } as ApiError };
  }

  // 5. Resend cooldown check
  const existing = otpStore.get(phone);
  const now = Date.now();
  if (existing && now < existing.resendAllowedAt) {
    const retryAfter = Math.ceil((existing.resendAllowedAt - now) / 1000);
    return { status: 429, body: { error: 'Please wait before requesting a new code', retryAfter } as ApiError };
  }

  // 6. Send via kwtSMS
  const code = generateCode();
  const sendResult = await sms.send(phone, `Your verification code for MYAPP is: ${code}`);

  if (sendResult.result !== 'OK') {
    // Don't leak internal error codes to clients
    console.error('[OTP] Send failed:', sendResult.code, sendResult.description);
    return { status: 500, body: { error: 'Failed to send verification code. Please try again.' } };
  }

  // 7. Store OTP
  otpStore.set(phone, {
    code,
    expiresAt: now + OTP_TTL_MS,
    resendAllowedAt: now + RESEND_COOLDOWN_MS,
    used: false,
  });

  console.log(`[OTP] Sent to ${phone.slice(0, 5)}***`); // log masked phone
  return { status: 200, body: { success: true, resendIn: Math.ceil(RESEND_COOLDOWN_MS / 1000) } };
}

async function handleVerifyOtp(
  body: VerifyOtpRequest,
): Promise<{ status: number; body: object }> {
  const { phone, code } = body;

  if (!phone || !code) {
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

  // Mark as used before returning success
  record.used = true;

  return { status: 200, body: { success: true } };
}

// ── Minimal HTTP server (replaces Express for this standalone example) ─────────
// In your project, replace with:
//   app.post('/auth/send-otp', async (req, res) => { ... })
//   app.post('/auth/verify-otp', async (req, res) => { ... })

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? '0.0.0.0';

  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let body: Record<string, string> = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}

  let result: { status: number; body: object };

  if (req.method === 'POST' && req.url === '/auth/send-otp') {
    result = await handleSendOtp(body as SendOtpRequest, ip);
  } else if (req.method === 'POST' && req.url === '/auth/verify-otp') {
    result = await handleVerifyOtp(body as VerifyOtpRequest);
  } else {
    result = { status: 404, body: { error: 'Not found' } };
  }

  res.writeHead(result.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.body));
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`OTP server running at http://localhost:${PORT}`);
  console.log('\nTest with curl:');
  console.log(`  Send OTP:   curl -X POST http://localhost:${PORT}/auth/send-otp -H 'Content-Type: application/json' -d '{"phone":"96598765432","captchaToken":"test123"}'`);
  console.log(`  Verify OTP: curl -X POST http://localhost:${PORT}/auth/verify-otp -H 'Content-Type: application/json' -d '{"phone":"96598765432","code":"123456"}'`);
});
