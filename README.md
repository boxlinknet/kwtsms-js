# kwtsms

JavaScript/TypeScript client for the [kwtSMS SMS API](https://www.kwtsms.com). Send SMS, validate numbers, check balance. Zero runtime dependencies.

[![npm version](https://badge.fury.io/js/kwtsms.svg)](https://www.npmjs.com/package/kwtsms)

## Install

```bash
npm install kwtsms
# or
yarn add kwtsms
# or
pnpm add kwtsms
# or
bun add kwtsms
```

Works in Node.js 16+, Bun, Next.js, and any JavaScript/TypeScript runtime.

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
  // Always save msg-id — you need it for status checks later
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

## Setup

Create a `.env` file (never commit this file):
```ini
KWTSMS_USERNAME=your_api_user
KWTSMS_PASSWORD=your_api_pass
KWTSMS_SENDER_ID=YOUR-SENDERID
KWTSMS_TEST_MODE=1
KWTSMS_LOG_FILE=kwtsms.log
```

Or use the interactive CLI wizard:
```bash
npx kwtsms setup
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

> **Tip:** Never call `balance()` after `send()`. The send response already includes `balance-after`. Save it — no extra API call needed.

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

Phone numbers are normalized automatically — `+`, `00`, spaces, dashes, Arabic digits all handled.

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

> **Always save `msg-id` immediately.** You need it for status checks and delivery reports. It cannot be retrieved later.

> **`unix-timestamp` in responses is GMT+3 (Asia/Kuwait server time)**, not UTC. Always convert when storing.

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

## Utility Functions

```typescript
import { normalizePhone, validatePhoneInput, cleanMessage } from 'kwtsms';

normalizePhone('+96598765432');     // → '96598765432'
normalizePhone('00 965 9876 5432'); // → '96598765432'

const [valid, error, normalized] = validatePhoneInput('+96598765432');
// [true, null, '96598765432']

cleanMessage('Hello 😀 <b>World</b> \uFEFF'); // → 'Hello  World '
```

## CLI

```bash
kwtsms setup                                         # interactive setup wizard
kwtsms verify                                        # test credentials, show balance
kwtsms balance                                       # show balance
kwtsms senderid                                      # list sender IDs
kwtsms coverage                                      # list active country prefixes
kwtsms send 96598765432 "Your OTP is: 123456"
kwtsms send 96598765432,96512345678 "Hello" --sender MY-APP
kwtsms validate +96598765432 0096512345678 abc
```

Install globally for direct use:
```bash
npm install -g kwtsms
```

Or use without installing:
```bash
npx kwtsms setup
```

## Credential Management

**Never hardcode credentials.** They must be changeable without redeploying.

### Recommended patterns:

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

## Best Practices

### 1. Save msg-id and balance-after from every send

```typescript
const result = await sms.send(phone, message);
if (result.result === 'OK') {
  await db.save({ msgId: result['msg-id'], balance: result['balance-after'] });
  // You NEED msg-id later for status/DLR checks
  // balance-after eliminates the need for a separate balance() call
}
```

### 2. Validate before calling the API

```typescript
const [valid, error, normalized] = validatePhoneInput(userPhone);
if (!valid) return { error }; // never hits API for invalid input

const prefixes = await sms.coverage(); // cache this at startup
if (!isCountryActive(normalized, prefixes)) return { error: 'Country not supported' };

const result = await sms.send(normalized, message);
```

### 3. OTP implementation

```typescript
// Always include app name (telecom compliance requirement)
const otpMessage = `Your OTP for MYAPP is: ${otp}`;

// Always use Transactional Sender ID for OTP
// Promotional IDs are silently blocked on DND numbers (credits still deducted)
const result = await sms.send(phone, otpMessage, 'MY-TRANS-ID');

// One number per OTP request (avoids ERR028 rate limit affecting entire batch)
// Minimum 3-4 min resend timer, 3-5 min expiry, new code on every resend
```

### 4. Show user-friendly errors, not raw API codes

```typescript
const USER_ERRORS: Record<string, string> = {
  ERR025: 'Please enter a valid phone number in international format (e.g., +965 9876 5432).',
  ERR028: 'Please wait a moment before requesting another code.',
  ERR026: 'SMS delivery to this country is not available.',
};

if (result.result === 'ERROR') {
  const userMsg = USER_ERRORS[result.code ?? '']
    ?? 'SMS service temporarily unavailable. Please try again.';
  // Log result.action for admin — never show raw API errors to end users
}
```

### 5. Server timezone

`unix-timestamp` in all API responses is **GMT+3 (Asia/Kuwait)**, not UTC. Convert when storing:
```typescript
const serverTime = new Date(result['unix-timestamp'] * 1000);
// This is GMT+3. Subtract 3 hours for UTC if needed.
```

### 6. Sender ID types

| | Promotional | Transactional |
|--|-------------|---------------|
| Use for | Bulk SMS, marketing | OTP, alerts, notifications |
| DND delivery | Blocked (credits lost) | Bypasses DND |
| Cost | 10 KD | 15 KD |

**For OTP, always use Transactional.** Using Promotional for OTP means messages to DND numbers are silently blocked and credits are still deducted.

`KWT-SMS` is a shared test sender — never use in production.

## Security Checklist

Before going live, verify all of these:

```
[ ] CAPTCHA enabled on all SMS-triggering forms
[ ] Rate limit per phone number (max 3-5 OTP requests/hour)
[ ] Rate limit per IP address (max 10-20 requests/hour)
[ ] Rate limit per user/session if authenticated
[ ] .env file is in .gitignore and never committed
[ ] Credentials stored securely (not hardcoded, not in client-side code)
[ ] Test mode OFF (KWTSMS_TEST_MODE=0)
[ ] Private Sender ID registered (not KWT-SMS)
[ ] Transactional Sender ID for OTP (not Promotional)
[ ] Admin notification on low balance
[ ] Monitoring on failed sends and error rate spikes
```

- **OTP / sensitive messages:** set `logFile: ''` to disable logging, or ensure `kwtsms.log` has `chmod 600` — log entries include message bodies and phone numbers (passwords are always masked)

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

## Publishing (for maintainers)

```bash
# 1. Bump version
npm version patch   # 0.1.0 → 0.1.1  (bug fix)
npm version minor   # 0.1.x → 0.2.0  (new feature)
npm version major   # 0.x.x → 1.0.0  (breaking change)

# 2. Build
npm run build

# 3. Dry run — review what will be uploaded
npm publish --dry-run

# 4. Publish
npm publish --access public

# 5. Tag and push
git push && git push --tags
```

## License

MIT — see [LICENSE](LICENSE).
