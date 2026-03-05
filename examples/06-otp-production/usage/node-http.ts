/**
 * OTP endpoints — pure Node.js (node:http), zero framework dependencies.
 *
 * Routes:
 *   POST /auth/send-otp    body: { phone, captchaToken? }
 *   POST /auth/verify-otp  body: { phone, code }
 *
 * Run:
 *   npx tsx examples/06-otp-production/usage/node-http.ts
 *
 * Test:
 *   curl -X POST http://localhost:3000/auth/send-otp \
 *     -H "Content-Type: application/json" \
 *     -d '{"phone":"96598765432"}'
 */

import http from 'node:http';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// Swap store:
// import { createSQLiteStore } from '../adapters/sqlite.js';
// import { createDrizzleStore } from '../adapters/drizzle.js';
// import { createPrismaStore }  from '../adapters/prisma.js';

// Add CAPTCHA (optional):
// import { createTurnstileVerifier } from '../captcha/turnstile.js';
// import { createHCaptchaVerifier }  from '../captcha/hcaptcha.js';

const sms = KwtSMS.fromEnv();
const store = createMemoryStore();
// const store = createSQLiteStore({ filename: './otp.db' });

const otp = createOtpService({
  sms,
  store,
  appName: 'MyApp',
  // captcha: createTurnstileVerifier(process.env.TURNSTILE_SECRET!),
  // captcha: createHCaptchaVerifier(process.env.HCAPTCHA_SECRET!),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? '127.0.0.1';
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const ip = getClientIp(req);

  if (req.method === 'POST' && req.url === '/auth/send-otp') {
    try {
      const body = await readBody(req);
      const result = await otp.sendOtp(body.phone, body.captchaToken as string | undefined, ip);
      send(res, result.success ? 200 : (result.retryAfter ? 429 : 400), result);
    } catch {
      send(res, 400, { success: false, error: 'Invalid request body' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/auth/verify-otp') {
    try {
      const body = await readBody(req);
      const result = await otp.verifyOtp(body.phone, body.code, ip);
      send(res, result.success ? 200 : (result.retryAfter ? 429 : 400), result);
    } catch {
      send(res, 400, { success: false, error: 'Invalid request body' });
    }
    return;
  }

  send(res, 404, { success: false, error: 'Not found' });
});

server.listen(3000, () => {
  console.log('OTP server running on http://localhost:3000');
  console.log('POST /auth/send-otp   { phone, captchaToken? }');
  console.log('POST /auth/verify-otp { phone, code }');
});
