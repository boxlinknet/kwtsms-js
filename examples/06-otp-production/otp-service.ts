/**
 * Production OTP Service for kwtSMS
 *
 * Framework-agnostic. Plug in any database adapter and optional CAPTCHA verifier.
 *
 * Quick start:
 *   import { createOtpService } from './otp-service.js';
 *   import { createMemoryStore } from './adapters/memory.js';
 *
 *   const service = createOtpService({
 *     sms: KwtSMS.fromEnv(),
 *     store: createMemoryStore(),
 *     appName: 'MyApp',
 *   });
 *
 *   const result = await service.sendOtp(phone, captchaToken, clientIp);
 *   const result = await service.verifyOtp(phone, code, clientIp);
 *
 * Swap the database:
 *   const store = createMemoryStore();          // dev / single-process
 *   const store = createSQLiteStore({ filename: './otp.db' });
 *   const store = createDrizzleStore({ db });   // pass your drizzle db instance
 *   const store = createPrismaStore({ prisma }); // pass your prisma client
 *
 * Add CAPTCHA:
 *   const captcha = createTurnstileVerifier(process.env.TURNSTILE_SECRET!);
 *   const captcha = createHCaptchaVerifier(process.env.HCAPTCHA_SECRET!);
 */

import { compare, hash } from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { KwtSMS, validatePhoneInput } from '../../src/index.js';

// ── Constants (all overridable via OtpServiceConfig) ─────────────────────────

export const OTP_TTL_MS = 5 * 60 * 1000;            // 5 minutes
export const RESEND_COOLDOWN_MS = 4 * 60 * 1000;    // 4 minutes (kwtSMS standard)
export const MAX_ATTEMPTS = 3;                        // wrong guesses before code invalidated
export const RATE_WINDOW_MS = 60 * 60 * 1000;        // 1-hour sliding window
export const MAX_SENDS_PER_IP = 10;                  // per hour
export const MAX_SENDS_PER_PHONE = 3;                // per hour
export const MAX_VERIFY_PER_PHONE = 5;               // per hour (brute-force guard)
export const BCRYPT_COST = 8;                        // fast + secure for 6-digit codes

// ── Interfaces ────────────────────────────────────────────────────────────────

/** Stored per OTP request. Code is always a bcrypt hash — never plain text. */
export interface OtpRecord {
  phone: string;             // normalized (digits only, e.g. "96598765432")
  code: string;              // bcrypt hash of 6-digit code
  expiresAt: number;         // unix ms
  resendAllowedAt: number;   // unix ms — enforce 4-min cooldown between sends
  attempts: number;          // wrong guesses so far
  used: boolean;
  createdAt: number;         // unix ms
  ipAddress?: string;        // optional audit trail
}

/**
 * Database adapter interface.
 * Implement this for any database (Redis, MongoDB, DynamoDB, etc.)
 * See adapters/ for ready-made implementations.
 */
export interface OtpStore {
  get(phone: string): Promise<OtpRecord | null>;
  set(phone: string, record: OtpRecord): Promise<void>;
  delete(phone: string): Promise<void>;
  /**
   * Optional: DB-backed rate limiting.
   * If not implemented, falls back to in-memory rate limiting.
   * Implement when running multiple server instances.
   */
  getRateLimit?(key: string): Promise<number[]>;
  setRateLimit?(key: string, timestamps: number[]): Promise<void>;
}

/**
 * CAPTCHA adapter interface.
 * See captcha/ for Cloudflare Turnstile and hCaptcha implementations.
 */
export interface CaptchaVerifier {
  verify(token: string, ip?: string): Promise<boolean>;
}

export interface OtpServiceConfig {
  /** Initialized KwtSMS client. */
  sms: KwtSMS;
  /** Database adapter. Use createMemoryStore() for dev. */
  store: OtpStore;
  /** Optional CAPTCHA verifier. Omit to skip CAPTCHA (dev/trusted clients). */
  captcha?: CaptchaVerifier;
  /** Included in SMS text: "Your {appName} verification code is: 123456" */
  appName: string;
}

export interface SendOtpResult {
  success: boolean;
  error?: string;
  /** Seconds until resend is allowed (when resend cooldown active). */
  resendIn?: number;
  /** Seconds until rate limit window resets. */
  retryAfter?: number;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  /** Remaining wrong guesses before code is invalidated (forces resend). */
  attemptsLeft?: number;
  /** Seconds until rate limit window resets. */
  retryAfter?: number;
}

/** The return type of createOtpService() */
export interface OtpService {
  sendOtp(rawPhone: unknown, captchaToken?: string, ip?: string): Promise<SendOtpResult>;
  verifyOtp(rawPhone: unknown, rawCode: unknown, ip?: string): Promise<VerifyOtpResult>;
}

// ── Input Sanitization ────────────────────────────────────────────────────────

/**
 * Sanitize and validate a phone number input.
 *
 * Steps:
 *   1. Type check — must be string
 *   2. Length guard — reject > 30 chars (memory attack prevention)
 *   3. trim()
 *   4. validatePhoneInput() — normalizes + validates (strips +/00/spaces/dashes,
 *      converts Arabic-Indic digits, rejects emails/too-short/too-long)
 *
 * Returns [normalizedPhone, error] — error is null on success.
 */
export function sanitizePhone(raw: unknown): [string, string | null] {
  if (typeof raw !== 'string') return ['', 'Phone number must be a string'];
  if (raw.length > 30) return ['', 'Phone number is too long'];
  const trimmed = raw.trim();
  if (!trimmed) return ['', 'Phone number is required'];
  const [isValid, error, normalized] = validatePhoneInput(trimmed);
  if (!isValid) return ['', error ?? 'Invalid phone number'];
  return [normalized, null];
}

/**
 * Sanitize an OTP code input.
 *
 * Steps:
 *   1. Type check — must be string
 *   2. trim() — handles copy-paste with surrounding whitespace
 *   3. Strip non-digit characters — "1 2 3 4 5 6" → "123456"
 *   4. Length check — must be exactly 6 digits
 *
 * Returns [cleanedCode, error] — error is null on success.
 */
export function sanitizeCode(raw: unknown): [string, string | null] {
  if (typeof raw !== 'string') return ['', 'Code must be a string'];
  const digits = raw.trim().replace(/\D/g, '');
  if (digits.length === 0) return ['', 'Code is required'];
  if (digits.length !== 6) return ['', `Code must be exactly 6 digits (got ${digits.length})`];
  return [digits, null];
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────
//
// Two-tier sliding window:
//   Tier 1: In-memory Map (always runs — zero latency, resets on restart)
//   Tier 2: DB-backed via store.getRateLimit/setRateLimit (if implemented)
//
// Both tiers must pass. In-memory is checked first — if blocked, DB is skipped.
// Use DB-backed when running multiple server instances (shared state).

const memRateLimits = new Map<string, number[]>();

async function checkRateLimit(
  store: OtpStore,
  key: string,
  max: number,
  windowMs: number,
): Promise<{ limited: boolean; retryAfter: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Tier 1: In-memory sliding window
  const memHits = (memRateLimits.get(key) ?? []).filter((t) => t > windowStart);
  if (memHits.length >= max) {
    const oldest = Math.min(...memHits);
    return { limited: true, retryAfter: Math.ceil((oldest + windowMs - now) / 1000) };
  }
  memHits.push(now);
  memRateLimits.set(key, memHits);

  // Tier 2: DB-backed (optional — only if adapter implements it)
  if (store.getRateLimit && store.setRateLimit) {
    const dbHits = (await store.getRateLimit(key)).filter((t) => t > windowStart);
    if (dbHits.length >= max) {
      const oldest = Math.min(...dbHits);
      return { limited: true, retryAfter: Math.ceil((oldest + windowMs - now) / 1000) };
    }
    dbHits.push(now);
    await store.setRateLimit(key, dbHits);
  }

  return { limited: false, retryAfter: 0 };
}

// ── Code Generation ───────────────────────────────────────────────────────────

/** Generate a cryptographically secure 6-digit OTP code. */
function generateCode(): string {
  return String(randomInt(100_000, 1_000_000)); // 100000–999999 inclusive
}

// ── createOtpService ──────────────────────────────────────────────────────────

/**
 * Create a production-ready OTP service.
 *
 * @example
 * const service = createOtpService({
 *   sms: KwtSMS.fromEnv(),
 *   store: createMemoryStore(),
 *   appName: 'MyApp',
 * });
 *
 * // In your send-otp route:
 * const result = await service.sendOtp(req.body.phone, req.body.captchaToken, req.ip);
 * if (!result.success) return res.status(400).json(result);
 * res.json({ success: true });
 *
 * // In your verify-otp route:
 * const result = await service.verifyOtp(req.body.phone, req.body.code, req.ip);
 * if (!result.success) return res.status(400).json(result);
 * // User is verified — create session, issue JWT, etc.
 */
export function createOtpService(config: OtpServiceConfig): OtpService {
  const { sms, store, captcha, appName } = config;

  /**
   * Send an OTP to a phone number.
   *
   * Full flow:
   *   1. Sanitize + validate phone (no SMS credit wasted on invalid numbers)
   *   2. Verify CAPTCHA (if configured)
   *   3. Rate limit by IP (10 sends/hour)
   *   4. Rate limit by phone (3 sends/hour)
   *   5. Enforce 4-minute resend cooldown
   *   6. Generate 6-digit code + bcrypt hash it
   *   7. Persist record to store
   *   8. Send SMS via kwtSMS (only after all checks pass)
   */
  async function sendOtp(
    rawPhone: unknown,
    captchaToken?: string,
    ip?: string,
  ): Promise<SendOtpResult> {
    // 1. Sanitize + validate phone — rejects invalid numbers before any SMS credit is spent
    const [phone, phoneError] = sanitizePhone(rawPhone);
    if (phoneError) return { success: false, error: phoneError };

    // 2. CAPTCHA verification
    if (captcha) {
      if (!captchaToken) return { success: false, error: 'CAPTCHA token is required' };
      const captchaOk = await captcha.verify(captchaToken, ip);
      if (!captchaOk) return { success: false, error: 'CAPTCHA verification failed. Please try again.' };
    }

    // 3. Rate limit by IP (prevents SMS bombing from one IP address)
    if (ip) {
      const { limited, retryAfter } = await checkRateLimit(
        store, `ip:${ip}`, MAX_SENDS_PER_IP, RATE_WINDOW_MS,
      );
      if (limited) {
        return { success: false, error: 'Too many requests from this IP address', retryAfter };
      }
    }

    // 4. Rate limit by phone (prevents targeting one victim repeatedly)
    const { limited: phoneLimited, retryAfter: phoneRetry } = await checkRateLimit(
      store, `phone:${phone}`, MAX_SENDS_PER_PHONE, RATE_WINDOW_MS,
    );
    if (phoneLimited) {
      return { success: false, error: 'Too many OTP requests for this number', retryAfter: phoneRetry };
    }

    // 5. Resend cooldown — must wait 4 minutes between sends
    const existing = await store.get(phone);
    const now = Date.now();
    if (existing && now < existing.resendAllowedAt) {
      const resendIn = Math.ceil((existing.resendAllowedAt - now) / 1000);
      return { success: false, error: 'Please wait before requesting a new code', resendIn };
    }

    // 6. Generate + hash code
    const code = generateCode();
    const hashedCode = await hash(code, BCRYPT_COST);

    // 7. Persist (overwrites any previous code for this number)
    await store.set(phone, {
      phone,
      code: hashedCode,
      expiresAt: now + OTP_TTL_MS,
      resendAllowedAt: now + RESEND_COOLDOWN_MS,
      attempts: 0,
      used: false,
      createdAt: now,
      ipAddress: ip,
    });

    // 8. Send SMS — only reached after ALL checks pass
    const result = await sms.send(
      phone,
      `Your ${appName} verification code is: ${code}. Valid for 5 minutes. Do not share this code.`,
    );

    if (result.result !== 'OK') {
      // Roll back stored record if SMS fails — don't leave a dangling record
      await store.delete(phone);
      return { success: false, error: result.description ?? 'Failed to send OTP. Please try again.' };
    }

    return { success: true };
  }

  /**
   * Verify an OTP code submitted by the user.
   *
   * Full flow:
   *   1. Sanitize + validate both inputs
   *   2. Rate limit verify attempts by phone (5/hour — brute-force guard)
   *   3. Look up stored record
   *   4. Check: already used
   *   5. Check: expired
   *   6. Check: too many wrong attempts (>= 3 → delete record, force resend)
   *   7. bcrypt.compare (timing-safe)
   *   8. Wrong: increment attempts. Correct: mark used.
   */
  async function verifyOtp(
    rawPhone: unknown,
    rawCode: unknown,
    ip?: string,
  ): Promise<VerifyOtpResult> {
    // 1. Sanitize inputs
    const [phone, phoneError] = sanitizePhone(rawPhone);
    if (phoneError) return { success: false, error: phoneError };

    const [code, codeError] = sanitizeCode(rawCode);
    if (codeError) return { success: false, error: codeError };

    // 2. Rate limit verify attempts (brute-force guard)
    const { limited, retryAfter } = await checkRateLimit(
      store, `verify:${phone}`, MAX_VERIFY_PER_PHONE, RATE_WINDOW_MS,
    );
    if (limited) {
      return { success: false, error: 'Too many verification attempts. Please wait.', retryAfter };
    }

    // 3. Look up record
    const record = await store.get(phone);
    if (!record) {
      return { success: false, error: 'No OTP requested for this number. Please request a new code.' };
    }

    // 4. Already used
    if (record.used) {
      return { success: false, error: 'This code has already been used. Please request a new one.' };
    }

    // 5. Expired
    if (Date.now() > record.expiresAt) {
      await store.delete(phone);
      return { success: false, error: 'Code has expired. Please request a new one.' };
    }

    // 6. Too many wrong attempts
    if (record.attempts >= MAX_ATTEMPTS) {
      await store.delete(phone);
      return { success: false, error: 'Too many wrong attempts. Please request a new code.' };
    }

    // 7. Compare (bcrypt is timing-safe — no timing attacks possible)
    const correct = await compare(code, record.code);

    if (!correct) {
      const newAttempts = record.attempts + 1;
      const attemptsLeft = MAX_ATTEMPTS - newAttempts;
      if (attemptsLeft <= 0) {
        await store.delete(phone);
        return { success: false, error: 'Too many wrong attempts. Please request a new code.' };
      }
      await store.set(phone, { ...record, attempts: newAttempts });
      return { success: false, error: 'Incorrect code', attemptsLeft };
    }

    // 8. Correct — mark as used (one-time use)
    await store.set(phone, { ...record, used: true });
    return { success: true };
  }

  return { sendOtp, verifyOtp };
}
