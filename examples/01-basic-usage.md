# Example 01: Basic Usage

Covers credential setup, balance checking, and sending a single SMS.

## Prerequisites

Install the package and a TypeScript runner for these examples:

```bash
npm install kwtsms
npm install --save-dev tsx
```

## Set Up Credentials

Create a `.env` file in your project root (never commit it):

```
KWTSMS_USERNAME=your_api_username
KWTSMS_PASSWORD=your_api_password
KWTSMS_SENDER_ID=MYAPP
KWTSMS_TEST_MODE=1
```

> **Important:** `KWTSMS_USERNAME` and `KWTSMS_PASSWORD` are your **API credentials** —
> not your account phone number or login password. Find them at
> kwtsms.com → Account → API Settings.

> **Test mode:** `KWTSMS_TEST_MODE=1` queues the message but never delivers it to
> the handset. No credits are consumed. Set to `0` before going live.

## Run the Example

```bash
npx tsx examples/01-basic-usage.ts
```

Or pass credentials inline without a `.env` file:

```bash
KWTSMS_USERNAME=myuser KWTSMS_PASSWORD=mypass npx tsx examples/01-basic-usage.ts
```

## What the Example Does

### 1. Create a client

```typescript
import { KwtSMS } from 'kwtsms';

// Load from .env / environment variables (recommended)
const sms = KwtSMS.fromEnv();

// Or explicit credentials
const sms = new KwtSMS('myuser', 'mypass', {
  senderId: 'MYAPP',
  testMode: true,
});
```

`KwtSMS.fromEnv()` reads these env vars in order — process.env first, then `.env` file:

| Variable | Required | Default |
|----------|----------|---------|
| `KWTSMS_USERNAME` | Yes | — |
| `KWTSMS_PASSWORD` | Yes | — |
| `KWTSMS_SENDER_ID` | No | `KWT-SMS` |
| `KWTSMS_TEST_MODE` | No | `0` (off) |
| `KWTSMS_LOG_FILE` | No | `kwtsms.log` |

### 2. Verify credentials

```typescript
const [ok, balance, error] = await sms.verify();

if (!ok) {
  console.error('Auth failed:', error);
  process.exit(1);
}

console.log(`Balance: ${balance} credits`);
```

`verify()` returns a 3-element tuple — it never throws:

| Position | Type | Meaning |
|----------|------|---------|
| `[0]` | `boolean` | `true` if credentials are valid |
| `[1]` | `number \| null` | Available balance (null on failure) |
| `[2]` | `string \| null` | Error message (null on success) |

### 3. Check balance

```typescript
const balance = await sms.balance();       // fresh API call
const cached  = sms.cachedBalance;         // from last verify() or send()
```

`sms.cachedBalance` is updated after every `verify()` and `send()` call.
Use it to avoid an extra API call after a successful send.

### 4. Send an SMS

```typescript
const result = await sms.send('96598765432', 'Hello from MYAPP!');

if (result.result === 'OK') {
  console.log('msg-id:', result['msg-id']);           // save this for status checks
  console.log('credits charged:', result['points-charged']);
  console.log('balance after:', result['balance-after']);
} else {
  console.error(result.description);
  if (result.action) console.error('Fix:', result.action);
}
```

Phone number formats accepted — the library normalizes automatically:

| Input | Normalized |
|-------|-----------|
| `+96598765432` | `96598765432` |
| `0096598765432` | `96598765432` |
| `965 9876 5432` | `96598765432` |
| `٩٦٥٩٨٧٦٥٤٣٢` | `96598765432` |

### 5. Save the msg-id

Always save `result['msg-id']` from a successful send — you need it later to
check its queue status later:

```typescript
const msgId = result['msg-id'];  // e.g. "f4c841adee210f31307633ceaebff2ec"
// store in your database so you can call sms.status(msgId) later
```

## Error Handling

Every method returns a result object — none of them throw. Check `result.result`:

```typescript
if (result.result === 'ERROR') {
  console.error(result.code);        // e.g. "ERR003"
  console.error(result.description); // human-readable message
  console.error(result.action);      // fix hint for known errors
}
```

Common errors:

| Code | Cause | Fix |
|------|-------|-----|
| `ERR003` | Wrong username or password | Check API credentials in account settings |
| `ERR006` | No valid numbers | Check phone format: digits only, international |
| `ERR008` | Sender ID banned | Use a registered sender ID |
| `ERR010` | Zero balance | Top up credits at kwtsms.com |
| `ERR025` | Invalid number format | Strip `+`, `00`, spaces — digits only |

## Sender ID Warning

`KWT-SMS` is the default shared sender for **testing only**. It may cause delays
and is blocked on Virgin Kuwait numbers. Register your own sender ID before
going live at kwtsms.com → Account → Sender IDs.
