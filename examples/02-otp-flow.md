# Example 02: OTP Flow

A complete in-memory OTP implementation with send, verify, expiry, and resend cooldown.

## What This Covers

- Generating cryptographically secure 6-digit codes
- Sending OTP SMS with app name in the message body
- Verifying user input with expiry and replay protection
- Enforcing a 4-minute resend cooldown
- Invalidating codes immediately after successful use

## Run

```bash
npx tsx examples/02-otp-flow.ts
```

## Architecture

```
User action         Your server               kwtSMS API
──────────────────────────────────────────────────────────
Request OTP ──────► sendOtp(phone)
                    generate 6-digit code
                    store { code, expiresAt, used }
                    sms.send(phone, "Your code for MYAPP is: 123456") ──► POST /API/send/
                    ◄─────────────────────────────────────────────────── { result: "OK", msg-id: ... }
                    ◄── success ──

Submit code ──────► verifyOtp(phone, inputCode)
                    check expiry
                    check used flag
                    compare codes
                    mark used = true
                    ◄── success/error ──
```

## Key Implementation Details

### 1. Generate secure codes

```typescript
import { randomInt } from 'node:crypto';

function generateCode(): string {
  return String(randomInt(100_000, 1_000_000)); // always 6 digits, crypto-safe
}
```

Use `crypto.randomInt` — not `Math.random()`. `Math.random()` is not
cryptographically secure and its outputs can be predicted.

### 2. Always include the app name

```typescript
sms.send(phone, `Your verification code for MYAPP is: ${code}`);
```

Including the app name is a telecom compliance requirement in Kuwait. Messages
without an app name may be filtered or delayed.

### 3. OTP record structure

```typescript
interface OtpRecord {
  code: string;
  expiresAt: number;       // unix ms — typically now + 5 minutes
  resendAllowedAt: number; // unix ms — block resend for 4 minutes (KNET standard)
  used: boolean;           // true after one successful verification
}
```

Store this in Redis or your database — never in process memory in production.
In-process storage is lost on restart and doesn't work across multiple servers.

### 4. Enforce resend cooldown

```typescript
if (now < existing.resendAllowedAt) {
  const waitSec = Math.ceil((existing.resendAllowedAt - now) / 1000);
  return { success: false, error: 'Please wait', resendIn: waitSec };
}
```

4 minutes is the KNET standard. Always show the user a countdown timer so they
know how long to wait. Never allow unlimited resends — bots can drain your
entire balance.

### 5. Invalidate immediately after use

```typescript
record.used = true;  // set before returning success
```

Set `used = true` before returning the success response. This prevents replay
attacks where a valid code is submitted twice in rapid succession.

### 6. Generate a new code on every resend

```typescript
const code = generateCode(); // always a fresh code
otpStore.set(phone, { code, expiresAt: ..., resendAllowedAt: ..., used: false });
```

Never resend the same code. Always generate a new one — the previous record is
overwritten, so the old code is automatically invalidated.

## Verification Logic

```typescript
function verifyOtp(phone: string, input: string): { success: boolean; error?: string } {
  const record = otpStore.get(phone);

  if (!record)              return { success: false, error: 'No OTP requested' };
  if (record.used)          return { success: false, error: 'Code already used' };
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return { success: false, error: 'Code expired' };
  }
  if (input.trim() !== record.code) return { success: false, error: 'Incorrect code' };

  record.used = true;
  return { success: true };
}
```

## Production Checklist

- [ ] Use Redis or database — not in-process Map
- [ ] Use a **Transactional** sender ID (not KWT-SMS) — so DND numbers receive OTPs
- [ ] Add CAPTCHA on the form before calling sendOtp
- [ ] Rate limit per phone: max 3–5 OTP requests per hour
- [ ] Rate limit per IP: max 3–5 SMS sends per rolling window
- [ ] Show countdown timer in the UI using `resendIn` seconds
- [ ] OTP expiry: 3–5 minutes
- [ ] Resend cooldown: 4 minutes minimum

## Sender ID for OTP

OTP messages **must** use a Transactional sender ID. If you use a Promotional
sender ID (like the default `KWT-SMS`), messages to DND numbers are silently
blocked — credits are still deducted, but the user never receives the code.

| Sender type | DND numbers | Speed | One-time cost |
|-------------|-------------|-------|---------------|
| Promotional | Blocked | May delay | 10 KD |
| **Transactional** | **Delivered** | Priority | 15 KD |

To register a Transactional sender ID: kwtsms.com → Account → Buy Sender ID.
Processing takes ~5 working days.

## Expiry and Timing

| Setting | Recommended | Why |
|---------|-------------|-----|
| OTP TTL | 3–5 minutes | Short enough to limit brute-force window |
| Resend cooldown | 4 minutes | KNET standard, limits spam |
| Max resends/hour | 3–5 | Prevents balance drain |
