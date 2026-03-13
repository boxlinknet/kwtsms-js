# kwtSMS JavaScript Client

[![npm version](https://badge.fury.io/js/kwtsms.svg)](https://www.npmjs.com/package/kwtsms)
[![CI](https://github.com/boxlinknet/kwtsms-js/actions/workflows/ci.yml/badge.svg)](https://github.com/boxlinknet/kwtsms-js/actions/workflows/ci.yml)
[![CodeQL](https://github.com/boxlinknet/kwtsms-js/actions/workflows/codeql.yml/badge.svg)](https://github.com/boxlinknet/kwtsms-js/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

JavaScript/TypeScript client for the [kwtSMS SMS API](https://www.kwtsms.com). Send SMS, validate numbers, check balance, list sender IDs, check coverage, get message status. Zero runtime dependencies.

## About kwtSMS

kwtSMS is a Kuwaiti SMS gateway trusted by top businesses to deliver messages anywhere in the world, with private Sender ID, free API testing, non-expiring credits, and competitive flat-rate pricing. Secure, simple to integrate, built to last. Open a free account in under 1 minute, no paperwork or payment required. [Click here to get started](https://www.kwtsms.com/signup/)

## Prerequisites

You need **Node.js 18+** (or Bun) installed. Zero runtime dependencies. Uses Node.js built-in modules (`node:https`, `node:fs`).

### Step 1: Check if Node.js is installed

```bash
node --version
npm --version
```

If you see version numbers (v18 or higher), you're ready. If not, install Node.js:

- **All platforms (recommended):** Download [Node.js LTS](https://nodejs.org/) (free)
- **macOS:** `brew install node`
- **Ubuntu/Debian:** `sudo apt install nodejs npm`
- **Windows:** Download installer from [nodejs.org](https://nodejs.org/)

### Step 2: Install kwtsms

```bash
npm install kwtsms
# or
yarn add kwtsms
# or
pnpm add kwtsms
# or
bun add kwtsms
```

## Quick Start

**TypeScript / ESM:**
```typescript
import { KwtSMS } from 'kwtsms';

const sms = KwtSMS.fromEnv(); // reads from .env or environment variables

const [ok, balance, err] = await sms.verify();
if (ok) console.log(`Balance: ${balance}`);

const result = await sms.send('96598765432', 'Your OTP for MYAPP is: 123456');
if (result.result === 'OK') {
  console.log(`Sent! msg-id: ${result['msg-id']}, balance-after: ${result['balance-after']}`);
  // Always save msg-id, you need it for status checks later
} else {
  console.error(`Failed: ${result.code}: ${result.description}`);
  if (result.action) console.error(`What to do: ${result.action}`);
}
```

**JavaScript / CommonJS:**
```javascript
const { KwtSMS } = require('kwtsms');

const sms = KwtSMS.fromEnv();
const result = await sms.send('96598765432', 'Hello from kwtsms!');
```

## Setup / Configuration

Create a `.env` file (never commit this file):
```ini
KWTSMS_USERNAME=your_api_user
KWTSMS_PASSWORD=your_api_pass
KWTSMS_SENDER_ID=YOUR-SENDERID
KWTSMS_TEST_MODE=1
KWTSMS_LOG_FILE=kwtsms.log
```

Or pass credentials directly:
```typescript
const sms = new KwtSMS('your_api_user', 'your_api_pass', {
  senderId: 'MY-APP',
  testMode: false,
  logFile: 'kwtsms.log',
});
```

> **Important:** `KWTSMS_USERNAME` and `KWTSMS_PASSWORD` are your **API credentials**, not your account mobile number. Find them at kwtsms.com → Account → API.

## Credential Management

**Never hardcode credentials.** They must be changeable without redeploying.

**1. Environment variables / .env file (default)**
```typescript
const sms = KwtSMS.fromEnv(); // reads KWTSMS_USERNAME, KWTSMS_PASSWORD from env or .env
```
Add `.env` to `.gitignore`. Update credentials by editing the file.

**2. Admin settings UI (web apps)**

Store credentials in your database. Load and pass to constructor:
```typescript
const creds = await db.getSettings('kwtsms');
const sms = new KwtSMS(creds.username, creds.password, { senderId: creds.senderId });
```

**3. Secrets manager (production)**
```typescript
const secret = await secretsManager.getSecret('kwtsms-credentials');
const sms = new KwtSMS(secret.username, secret.password);
```

**Never:**
- Hardcode credentials in source code
- Commit `.env` files to git
- Put credentials in client-side JavaScript

## All Methods

### `KwtSMS.fromEnv(envFile?)`
Load credentials from environment variables, falling back to `.env` file.

```typescript
const sms = KwtSMS.fromEnv();           // reads .env in current directory
const sms = KwtSMS.fromEnv('/app/.env'); // custom path
```

### `sms.verify()`
Test credentials. Returns `[ok, balance, error]`. Never throws.

```typescript
const [ok, balance, err] = await sms.verify();
```

### `sms.balance()`
Get current balance. Returns `number | null`.

```typescript
const bal = await sms.balance();
```

> **Tip:** Never call `balance()` after `send()`. The send response already includes `balance-after`. Save it. No extra API call needed.

### `sms.send(mobile, message, sender?)`
Send SMS to one or more numbers. Validates inputs and cleans the message automatically.

```typescript
// Single number
const result = await sms.send('96598765432', 'Your OTP is: 123456');

// Multiple numbers
const result = await sms.send(['96598765432', '+96512345678'], 'Hello all!');

// Override sender for this call
const result = await sms.send('96598765432', 'Alert!', 'OTHER-ID');
```

For >200 numbers: automatically split into batches of 200 with 0.5s delay between batches.

**Response (single batch):**
```json
{
  "result": "OK",
  "msg-id": "f4c841adee210f31307633ceaebff2ec",
  "numbers": 1,
  "points-charged": 1,
  "balance-after": 180
}
```

> **Always save `msg-id` immediately.** You need it for status checks. It cannot be retrieved later.

### `sms.validate(phones[])`
Validate phone numbers before sending.

```typescript
const result = await sms.validate(['+96598765432', '0096512345678', 'bad-number']);
// result.ok  — valid and routable
// result.er  — format error
// result.nr  — no route (country not activated)
// result.rejected — locally rejected with error messages
```

### `sms.senderids()`
List sender IDs registered on your account.

```typescript
const result = await sms.senderids();
if (result.result === 'OK') console.log(result.senderids);
```

### `sms.coverage()`
List active country prefixes.

```typescript
const result = await sms.coverage();
```

### `sms.status(msgId)`
Check the queue status of a sent message. Returns the API response with error enrichment. Never throws.

```typescript
const result = await sms.status('f4c841adee210f31307633ceaebff2ec');
if (result.result === 'OK') {
  console.log('Status:', result.status);
} else {
  console.log(result.code, result.description); // e.g. ERR030 = stuck in queue
}
```

## Utility Functions

```typescript
import {
  normalizePhone, validatePhoneInput, validatePhoneFormat,
  findCountryCode, maskPhone, cleanMessage,
  PHONE_RULES, COUNTRY_NAMES,
} from 'kwtsms';
import type { PhoneRule } from 'kwtsms';

// Normalize: strip formatting, convert Arabic digits, remove leading zeros
normalizePhone('+96598765432');      // → '96598765432'
normalizePhone('00 965 9876 5432');  // → '96598765432'
normalizePhone('9660559123456');     // → '9660559123456' (local zero stripped later)

// Validate: returns [valid, error, normalizedNumber]
const [valid, error, normalized] = validatePhoneInput('+96598765432');
// [true, null, '96598765432']

validatePhoneInput('9660559123456');
// [true, null, '966559123456']  — strips local leading zero automatically

validatePhoneInput('+96512345');
// [false, "Invalid Kuwait number: expected 8 digits after +965, got 5", ...]

// Country-specific format check (used internally by validatePhoneInput)
validatePhoneFormat('96598765432');   // { valid: true }
validatePhoneFormat('9659123');       // { valid: false, error: 'Invalid Kuwait number: ...' }

// Find country code from a normalized number (longest-match: 3-digit → 2-digit → 1-digit)
findCountryCode('96598765432');  // → '965'
findCountryCode('14155551234');  // → '1'
findCountryCode('unknown');      // → null

// Mask for display: show first 4 and last 3 digits, **** for numbers under 7 digits
maskPhone('96598765432');  // → '9659****432'
maskPhone('123');          // → '****'

// Country rules table and names (read-only, 80+ countries)
PHONE_RULES['965'];        // → { localLengths: [8], mobileStartDigits: ['4','5','6','9'] }
COUNTRY_NAMES['965'];      // → 'Kuwait'

// Message cleaning
cleanMessage('Hello 😀 <b>World</b> \uFEFF'); // → 'Hello  World '
```

## Input Sanitization

`cleanMessage()` is called automatically by `send()` before every API call. It prevents the #1 cause of "message sent but not received" support tickets:

| Content | Effect without cleaning | What cleanMessage() does |
|---------|------------------------|--------------------------|
| Emojis | Stuck in queue, credits wasted, no error | Stripped |
| Hidden control characters (BOM, zero-width space, soft hyphen) | Spam filter rejection or queue stuck | Stripped |
| Arabic/Hindi numerals in body | OTP codes render inconsistently | Converted to Latin digits |
| HTML tags | ERR027, message rejected | Stripped |
| Directional marks (LTR, RTL) | May cause display issues | Stripped |

Arabic letters and Arabic text are fully supported and never stripped.

## Phone Number Formats

All formats are accepted and normalized automatically:

| Input | Normalized | Valid? |
|-------|-----------|--------|
| `96598765432` | `96598765432` | Yes |
| `+96598765432` | `96598765432` | Yes |
| `0096598765432` | `96598765432` | Yes |
| `965 9876 5432` | `96598765432` | Yes |
| `965-9876-5432` | `96598765432` | Yes |
| `(965) 98765432` | `96598765432` | Yes |
| `٩٦٥٩٨٧٦٥٤٣٢` | `96598765432` | Yes |
| `۹۶۵۹۸۷۶۵۴۳۲` | `96598765432` | Yes |
| `+٩٦٥٩٨٧٦٥٤٣٢` | `96598765432` | Yes |
| `٠٠٩٦٥٩٨٧٦٥٤٣٢` | `96598765432` | Yes |
| `٩٦٥ ٩٨٧٦ ٥٤٣٢` | `96598765432` | Yes |
| `٩٦٥-٩٨٧٦-٥٤٣٢` | `96598765432` | Yes |
| `965٩٨٧٦٥٤٣٢` | `96598765432` | Yes |
| `9660559123456` (966 + local 0559…) | `966559123456` | Yes — local leading zero stripped |
| `965098765432` (965 + local 098…) | `96598765432` | Yes — local leading zero stripped |
| `123456` (too short) | rejected | No |
| `user@gmail.com` | rejected | No |
| `96512345` (Kuwait, wrong length) | rejected | No — country rule: 8 digits after +965 |
| `9661234567` (Saudi, starts with 1) | rejected | No — country rule: must start with 5 |

Country-specific validation covers 80+ countries (GCC, Levant, Arab world, Europe, Asia, Americas, Africa, Oceania). Numbers from countries not in the rules table pass through with generic E.164 validation (7–15 digits).

## Test Mode

**Test mode** (`KWTSMS_TEST_MODE=1`) sends your message to the kwtSMS queue but does NOT deliver it to the handset. No SMS credits are consumed. Use this during development.

**Live mode** (`KWTSMS_TEST_MODE=0`) delivers the message for real and deducts credits. Always develop in test mode and switch to live only when ready for production.

## Sender ID

A **Sender ID** is the name that appears as the sender on the recipient's phone (e.g., "MY-APP" instead of a random number). Maximum 11 characters (GSM standard). Passing a longer value throws immediately from the constructor.

| | Promotional | Transactional |
|--|-------------|---------------|
| **Use for** | Bulk SMS, marketing, offers | OTP, alerts, notifications |
| **Delivery to DND numbers** | Blocked/filtered, credits lost | Bypasses DND (whitelisted) |
| **Speed** | May have delays | Priority delivery |
| **Cost** | 10 KD one-time | 15 KD one-time |

`KWT-SMS` is a shared test sender. It causes delivery delays, is blocked on Virgin Kuwait, and should never be used in production. Register your own private Sender ID through your kwtSMS account. For OTP/authentication messages, you need a **Transactional** Sender ID to bypass DND filtering. Sender ID is **case sensitive**.

## Server Timezone

`unix-timestamp` values in API responses are in **GMT+3 (Asia/Kuwait)** server time, not UTC. Convert when storing or displaying:

```typescript
const serverTime = new Date(result['unix-timestamp'] * 1000);
// This is GMT+3. Subtract 3 hours for UTC if needed.
```

## Best Practices

### Always save msg-id and balance-after

```typescript
const result = await sms.send(phone, message);
if (result.result === 'OK') {
  await db.save({ msgId: result['msg-id'], balance: result['balance-after'] });
  // You NEED msg-id later for status/DLR checks
  // balance-after eliminates the need for a separate balance() call
}
```

### Validate locally before calling the API

```typescript
const [valid, error, normalized] = validatePhoneInput(userPhone);
if (!valid) return { error }; // never hits API for invalid input

const prefixes = await sms.coverage(); // cache this at startup
if (!isCountryActive(normalized, prefixes)) return { error: 'Country not supported' };

const result = await sms.send(normalized, message);
```

### Country coverage pre-check

Call `coverage()` once at application startup and cache the active prefixes. Before every send, check if the number's country prefix is in the list. If not, return an error immediately without hitting the API.

### OTP requirements

- Always include app/company name: `"Your OTP for APPNAME is: 123456"` (telecom compliance requirement)
- Resend timer: minimum 3-4 minutes (KNET standard is 4 minutes)
- OTP expiry: 3-5 minutes
- New code on resend: always generate a fresh code, invalidate previous
- Use Transactional Sender ID for OTP (not Promotional, not KWT-SMS)
- One number per OTP request: never batch OTP sends (avoids ERR028 rate limit affecting entire batch)

### Show user-friendly errors, not raw API codes

```typescript
const USER_ERRORS: Record<string, string> = {
  ERR025: 'Please enter a valid phone number in international format (e.g., +965 9876 5432).',
  ERR028: 'Please wait a moment before requesting another code.',
  ERR026: 'SMS delivery to this country is not available.',
};

if (result.result === 'ERROR') {
  const userMsg = USER_ERRORS[result.code ?? '']
    ?? 'SMS service temporarily unavailable. Please try again.';
  // Log result.action for admin, never show raw API errors to end users
}
```

## Security Checklist

Before going live:

- [ ] CAPTCHA enabled on all SMS-triggering forms
- [ ] Rate limit per phone number (max 3-5 OTP requests/hour)
- [ ] Rate limit per IP address (max 10-20 requests/hour)
- [ ] Rate limit per user/session if authenticated
- [ ] `.env` file is in `.gitignore` and never committed
- [ ] Credentials stored securely (not hardcoded, not in client-side code)
- [ ] Test mode OFF (`KWTSMS_TEST_MODE=0`)
- [ ] Private Sender ID registered (not KWT-SMS)
- [ ] Transactional Sender ID for OTP (not Promotional)
- [ ] Admin notification on low balance
- [ ] Monitoring on failed sends and error rate spikes

**OTP / sensitive messages:** set `logFile: ''` to disable logging, or ensure `kwtsms.log` has `chmod 600`. Log entries include message bodies and phone numbers (passwords are always masked).

## Implementation Checklist

Before going live, test these scenarios:

- [ ] `+96512345678` sends successfully (strips `+`)
- [ ] `0096512345678` sends successfully (strips `00`)
- [ ] `965 1234 5678` sends successfully (strips spaces)
- [ ] `٩٦٥٩٨٧٦٥٤٣٢` sends successfully (Arabic digits converted)
- [ ] `123456` (too short) rejected with error, no SMS sent
- [ ] `user@gmail.com` rejected with error, no SMS sent
- [ ] English SMS received within 60s, message includes app name
- [ ] Arabic SMS displays correctly (not `????` or boxes)
- [ ] Correct OTP code accepted, wrong code rejected
- [ ] Expired OTP code rejected after 5 minutes
- [ ] Resend generates new code, invalidates previous
- [ ] Rapid resend blocked after 3-5 attempts
- [ ] Multiple phones from same IP blocked after limit
- [ ] CAPTCHA present and enforced before SMS is sent
- [ ] No internet shows clean error (not a stack trace)
- [ ] Message with emojis: stripped or error shown, not silent failure

## What's Handled Automatically

- **Phone normalization**: `+`, `00`, spaces, dashes, dots, parentheses stripped. Arabic-Indic digits converted. Leading zeros removed.
- **Country-specific validation**: 80+ countries validated against local number length and mobile prefix rules (e.g., Kuwait must be 8 digits starting with 4, 5, 6, or 9). Numbers from unknown countries pass through with generic E.164 validation.
- **Local leading zero correction**: Numbers entered as country code + local-with-zero (e.g., `9660559123456`) are automatically corrected to `966559123456`.
- **Duplicate phone removal**: If the same number appears multiple times (in different formats), it is sent only once.
- **Message cleaning**: Emojis removed (codepoint-safe via `Array.from()`). Hidden control characters (BOM, zero-width spaces, directional marks) removed. HTML tags stripped. Arabic-Indic digits in message body converted to Latin.
- **Batch splitting**: More than 200 numbers are automatically split into batches of 200 with 0.5s delay between batches.
- **ERR013 retry**: Queue-full errors are automatically retried up to 3 times with exponential backoff (30s / 60s / 120s).
- **Error enrichment**: Every API error response includes an `action` field with a developer-friendly fix hint.
- **Credential masking**: Passwords are always masked as `***` in log files. Never exposed.
- **Balance caching**: Balance is cached from every `verify()` and `send()` response. `balance()` falls back to the cached value on API failure.

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| ERR001 | API disabled | Enable at kwtsms.com → Account → API |
| ERR003 | Wrong credentials | Check KWTSMS_USERNAME and KWTSMS_PASSWORD |
| ERR006 | No valid numbers | Include country code (e.g., 96598765432) |
| ERR008 | Sender ID banned/not found | Check registered sender IDs (case-sensitive) |
| ERR010 | Zero balance | Recharge at kwtsms.com |
| ERR011 | Insufficient balance | Buy more credits |
| ERR013 | Queue full | Library retries automatically |
| ERR024 | IP not whitelisted | Add IP at Account → API → IP Lockdown |
| ERR026 | Country not activated | Contact kwtSMS support |
| ERR028 | 15s rate limit | Wait before resending to same number |
| ERR031/032 | Rejected (language/spam) | Review message content |

Full error table with all 33 codes: see [kwtSMS API docs](https://www.kwtsms.com/doc/KwtSMS.com_API_Documentation_v41.pdf).

## Examples

See the [examples/](examples/) directory:

| # | Example | Description |
|---|---------|-------------|
| 00 | [Raw API](examples/00-raw-api.ts) | Call every kwtSMS endpoint directly with `node:https`, no library, no dependencies |
| 01 | [Basic Usage](examples/01-basic-usage.ts) | Create client, verify credentials, check balance, send SMS |
| 02 | [OTP Flow](examples/02-otp-flow.ts) | OTP send + verify, expiry, resend cooldown, replay protection |
| 03 | [Bulk SMS](examples/03-bulk-sms.ts) | 500+ numbers, auto-batching, partial failure, msg-id tracking |
| 04 | [Express Endpoint](examples/04-express-endpoint.ts) | Express.js API endpoint with rate limiting and CAPTCHA |
| 05 | [Next.js Route](examples/05-nextjs-route.ts) | Next.js App Router route handlers |
| 06 | [OTP Production](examples/06-otp-production/) | Production OTP: adapters (memory, SQLite, Drizzle, Prisma), CAPTCHA (Turnstile, hCaptcha), 9 framework wiring files |

Each `.ts` file has a companion `.md` file with detailed explanation, code snippets, and a production checklist.

## Testing

```bash
# Unit tests (no credentials needed)
npm run test:unit

# Integration tests (real API, test mode, no credits consumed)
export JS_USERNAME=your_api_user
export JS_PASSWORD=your_api_pass
npm run test:integration
```

## Publishing (for maintainers)

Releases are automated via GitHub Actions. Pushing a `v*` tag triggers a build, test, and `npm publish --provenance` run. Follow the release checklist in `CLAUDE.md`.

## FAQ

**1. My message was sent successfully (result: OK) but the recipient didn't receive it. What happened?**

Check the **Sending Queue** at [kwtsms.com](https://www.kwtsms.com/login/). If your message is stuck there, it was accepted by the API but not dispatched. Common causes are emoji in the message, hidden characters from copy-pasting, or spam filter triggers. Delete it from the queue to recover your credits. Also verify that `test` mode is off (`KWTSMS_TEST_MODE=0`). Test messages are queued but never delivered.

**2. What is the difference between Test mode and Live mode?**

**Test mode** (`KWTSMS_TEST_MODE=1`) sends your message to the kwtSMS queue but does NOT deliver it to the handset. No SMS credits are consumed. Use this during development. **Live mode** (`KWTSMS_TEST_MODE=0`) delivers the message for real and deducts credits. Always develop in test mode and switch to live only when ready for production.

**3. What is a Sender ID and why should I not use "KWT-SMS" in production?**

A **Sender ID** is the name that appears as the sender on the recipient's phone (e.g., "MY-APP" instead of a random number). `KWT-SMS` is a shared test sender. It causes delivery delays, is blocked on Virgin Kuwait, and should never be used in production. Register your own private Sender ID through your kwtSMS account. For OTP/authentication messages, you need a **Transactional** Sender ID to bypass DND (Do Not Disturb) filtering.

**4. I'm getting ERR003 "Authentication error". What's wrong?**

You are using the wrong credentials. The API requires your **API username and API password**, NOT your account mobile number. Log in to [kwtsms.com](https://www.kwtsms.com/login/), go to Account, and check your API credentials. Also make sure you are using POST (not GET) and `Content-Type: application/json`.

**5. Can I send to international numbers (outside Kuwait)?**

International sending is **disabled by default** on kwtSMS accounts. [Log in to your kwtSMS account](https://www.kwtsms.com/login/) and add coverage for the country prefixes you need. Use `coverage()` to check which countries are currently active on your account. Be aware that activating international coverage increases exposure to automated abuse. Implement rate limiting and CAPTCHA before enabling.

## Help & Support

- **[kwtSMS FAQ](https://www.kwtsms.com/faq/)**: Answers to common questions about credits, sender IDs, OTP, and delivery
- **[kwtSMS Support](https://www.kwtsms.com/support.html)**: Open a support ticket or browse help articles
- **[Contact kwtSMS](https://www.kwtsms.com/#contact)**: Reach the kwtSMS team directly for Sender ID registration and account issues
- **[API Documentation (PDF)](https://www.kwtsms.com/doc/KwtSMS.com_API_Documentation_v41.pdf)**: kwtSMS REST API v4.1 full reference
- **[Best Practices](https://www.kwtsms.com/articles/sms-api-implementation-best-practices.html)**: SMS API implementation best practices
- **[Integration Test Checklist](https://www.kwtsms.com/articles/sms-api-integration-test-checklist.html)**: Pre-launch testing checklist
- **[Sender ID Help](https://www.kwtsms.com/sender-id-help.html)**: How to register, whitelist, and troubleshoot sender IDs
- **[kwtSMS Dashboard](https://www.kwtsms.com/login/)**: Recharge credits, buy Sender IDs, view message logs, manage coverage
- **[Other Integrations](https://www.kwtsms.com/integrations.html)**: Plugins and integrations for other platforms and languages

## License

[MIT](LICENSE)
