/**
 * Example 02: OTP Flow
 *
 * A complete in-memory OTP implementation:
 *   - Generate a 6-digit code
 *   - Send it via SMS
 *   - Verify user input (expiry, wrong code, used code)
 *   - Enforce resend cooldown (4-minute timer)
 *   - Invalidate code after one use
 *
 * Run:
 *   npx tsx examples/02-otp-flow.ts
 */

import { KwtSMS } from '../src/index.js';
import { randomInt } from 'node:crypto';

// ── OTP store ─────────────────────────────────────────────────────────────────
// In production: use Redis or your database, not an in-process Map.
// Key: normalized phone number. Value: OTP record.
interface OtpRecord {
  code: string;
  expiresAt: number;     // unix ms
  resendAllowedAt: number; // unix ms — enforce 4-min cooldown between sends
  used: boolean;
}
const otpStore = new Map<string, OtpRecord>();

const OTP_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const RESEND_COOLDOWN_MS = 4 * 60 * 1000; // 4 minutes (KNET standard)

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCode(): string {
  // Use crypto.randomInt for cryptographically secure 6-digit codes
  return String(randomInt(100_000, 1_000_000)); // 100000–999999
}

// ── sendOtp ───────────────────────────────────────────────────────────────────

async function sendOtp(
  sms: KwtSMS,
  phone: string,
): Promise<{ success: boolean; error?: string; resendIn?: number }> {
  const now = Date.now();
  const existing = otpStore.get(phone);

  // Enforce resend cooldown
  if (existing && now < existing.resendAllowedAt) {
    const waitSec = Math.ceil((existing.resendAllowedAt - now) / 1000);
    return {
      success: false,
      error: `Please wait before requesting a new code`,
      resendIn: waitSec,
    };
  }

  const code = generateCode();
  const appName = 'MYAPP'; // always include app name — telecom compliance requirement

  const result = await sms.send(phone, `Your verification code for ${appName} is: ${code}`);

  if (result.result !== 'OK') {
    return {
      success: false,
      error: result.description ?? 'Failed to send OTP',
    };
  }

  // Invalidate previous code (generate new one, old one is gone)
  otpStore.set(phone, {
    code,
    expiresAt: now + OTP_TTL_MS,
    resendAllowedAt: now + RESEND_COOLDOWN_MS,
    used: false,
  });

  return { success: true };
}

// ── verifyOtp ─────────────────────────────────────────────────────────────────

function verifyOtp(
  phone: string,
  input: string,
): { success: boolean; error?: string } {
  const record = otpStore.get(phone);

  if (!record) {
    return { success: false, error: 'No OTP requested for this number' };
  }

  if (record.used) {
    return { success: false, error: 'Code already used — request a new one' };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone); // clean up
    return { success: false, error: 'Code expired — request a new one' };
  }

  if (input.trim() !== record.code) {
    return { success: false, error: 'Incorrect code' };
  }

  // Mark as used immediately — prevent replay attacks
  record.used = true;

  return { success: true };
}

// ── Demo ──────────────────────────────────────────────────────────────────────

const sms = KwtSMS.fromEnv();
const [ok, , err] = await sms.verify();
if (!ok) { console.error('Auth failed:', err); process.exit(1); }

const PHONE = '96598765432'; // replace with a real number for live testing

console.log('=== OTP Flow Demo ===\n');

// 1. Send OTP
console.log('1. Sending OTP...');
const sendResult = await sendOtp(sms, PHONE);
if (!sendResult.success) {
  console.error('Failed to send OTP:', sendResult.error);
  process.exit(1);
}
console.log('   OTP sent successfully');

// 2. Show what was stored (never do this in production — just for demo)
const stored = otpStore.get(PHONE)!;
console.log(`   Code stored: ${stored.code}`);
console.log(`   Expires: ${new Date(stored.expiresAt).toISOString()}`);

// 3. Verify — wrong code
console.log('\n2. Verifying with wrong code (999999)...');
const wrongResult = verifyOtp(PHONE, '999999');
console.log('   Result:', wrongResult.error); // "Incorrect code"

// 4. Verify — correct code
console.log('\n3. Verifying with correct code...');
const correctResult = verifyOtp(PHONE, stored.code);
console.log('   Result:', correctResult.success ? 'SUCCESS — user authenticated' : correctResult.error);

// 5. Replay — same code again
console.log('\n4. Replaying used code...');
const replayResult = verifyOtp(PHONE, stored.code);
console.log('   Result:', replayResult.error); // "Code already used"

// 6. Resend during cooldown
console.log('\n5. Requesting new OTP during cooldown...');
const resendResult = await sendOtp(sms, PHONE);
if (!resendResult.success) {
  console.log(`   Blocked: ${resendResult.error}`);
  console.log(`   Wait ${resendResult.resendIn}s before resending`);
}
