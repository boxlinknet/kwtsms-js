# Example 00: Raw API Calls

Direct HTTP calls to every kwtSMS API endpoint using only `node:https`. No library, no dependencies. This example shows exactly what happens on the wire so you understand the API before using the `kwtsms` client library.

## Prerequisites

```bash
npm install --save-dev tsx    # to run .ts files directly
```

No other dependencies. The example uses only the built-in `node:https` module.

## Set Up Credentials

Set environment variables or edit the constants at the top of the file:

```bash
export KWTSMS_USERNAME=your_api_username
export KWTSMS_PASSWORD=your_api_password
```

> **Important:** these are your **API credentials** from kwtsms.com > Account > API Settings. They are not your account mobile number or login password.

## Run

```bash
npx tsx examples/00-raw-api.ts
```

Or pass credentials inline:

```bash
KWTSMS_USERNAME=myuser KWTSMS_PASSWORD=mypass npx tsx examples/00-raw-api.ts
```

## What the Example Does

The file calls all 6 kwtSMS API endpoints in order. Each section is self-contained: you can copy any block into your own code.

### Configuration

Four variables at the top of the file control everything:

```typescript
const USERNAME  = 'your_api_username';
const PASSWORD  = 'your_api_password';
const SENDER_ID = 'KWT-SMS';
const TEST_MODE = '1';  // "1" = queued but not delivered. "0" = live.
```

### Helper Function

One `post()` function handles all API calls. Every kwtSMS endpoint follows the same pattern: POST JSON, receive JSON.

```typescript
function post(endpoint: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.kwtsms.com',
      path: `/API/${endpoint}/`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    });
    req.write(data);
    req.end();
  });
}
```

Key rules:
- Always `POST`, never `GET`. GET logs credentials in server access logs even over HTTPS.
- Always set `Content-Type: application/json`. Omitting it switches to the legacy text/html API.
- Always set `Accept: application/json`.

---

### Step 1: Balance

Check available and purchased credits.

```typescript
const result = await post('balance', {
  username: USERNAME,
  password: PASSWORD,
});
```

**Success response:**
```json
{ "result": "OK", "available": 150, "purchased": 1000 }
```

**Error response (wrong credentials):**
```json
{ "result": "ERROR", "code": "ERR003", "description": "Authentication error..." }
```

If this fails, all other calls will fail too. Check your credentials first.

---

### Step 2: Sender IDs

List sender IDs registered on your account.

```typescript
const result = await post('senderid', {
  username: USERNAME,
  password: PASSWORD,
});
```

**Response:**
```json
{ "result": "OK", "senderid": ["KWT-SMS", "MY-APP"] }
```

`KWT-SMS` is a shared test sender. Never use it in production. Register a private sender ID at kwtsms.com > Account > Sender IDs.

---

### Step 3: Coverage

List active country prefixes on your account.

```typescript
const result = await post('coverage', {
  username: USERNAME,
  password: PASSWORD,
});
```

**Response:**
```json
{ "result": "OK", "prefixes": ["965", "966", "971"] }
```

If a country prefix is not in this list, messages to that country will fail with ERR026.

---

### Step 4: Validate Numbers

Check whether numbers are valid and routable before sending.

```typescript
const result = await post('validate', {
  username: USERNAME,
  password: PASSWORD,
  mobile: '96598765432,96512345678,123',
});
```

**Response:**
```json
{
  "result": "OK",
  "mobile": {
    "OK": ["96598765432"],
    "ER": ["123"],
    "NR": ["96512345678"]
  }
}
```

| Category | Meaning |
|----------|---------|
| `OK` | Valid and routable |
| `ER` | Format error (strip `+`, `00`, spaces; digits only) |
| `NR` | No route (country not activated on your account) |

---

### Step 5: Send SMS

Send a message to one or more phone numbers.

```typescript
const result = await post('send', {
  username: USERNAME,
  password: PASSWORD,
  sender: SENDER_ID,
  mobile: '96598765432',
  message: 'Your OTP for MYAPP is: 123456',
  test: TEST_MODE,
});
```

**Success response:**
```json
{
  "result": "OK",
  "msg-id": "f4c841adee210f31307633ceaebff2ec",
  "numbers": 1,
  "points-charged": 1,
  "balance-after": 149,
  "unix-timestamp": 1684763355
}
```

**Important fields to save:**
- `msg-id`: needed for status checks. Cannot be retrieved later.
- `balance-after`: your new credit balance. No need to call `/balance/` again.
- `unix-timestamp`: GMT+3 (Asia/Kuwait server time), not UTC. Convert when storing.

**Multiple numbers:** comma-separated, max 200 per request:
```typescript
mobile: '96598765432,96512345678,96599887766'
```

**Test mode:** `test: "1"` queues the message but does not deliver it. Credits are held in the queue. Delete from kwtsms.com > Queue to recover them.

---

### Step 6: Message Status

Check the queue status of a sent message.

```typescript
const result = await post('status', {
  username: USERNAME,
  password: PASSWORD,
  msgid: 'f4c841adee210f31307633ceaebff2ec',
});
```

**Possible responses:**

```json
{ "result": "OK", "status": "sent", "description": "Message successfully sent" }
```

```json
{ "result": "ERROR", "code": "ERR030", "description": "Message stuck in queue" }
```

In test mode, `ERR030` is normal. The message is stuck in the queue because it was never dispatched. Delete it from kwtsms.com > Queue to recover credits.

| Code | Meaning |
|------|---------|
| `ERR029` | Message ID does not exist or is wrong |
| `ERR030` | Message stuck in queue with error |

---

## Phone Number Format

Numbers must be in international format, digits only:

| Input | Correct? | Fix |
|-------|----------|-----|
| `96598765432` | Yes | |
| `+96598765432` | No | Strip `+` |
| `0096598765432` | No | Strip `00` |
| `965 9876 5432` | No | Strip spaces |
| `98765432` | No | Add country code `965` |

---

## Common Error Codes

| Code | Cause | Fix |
|------|-------|-----|
| `ERR003` | Wrong username or password | Check API credentials |
| `ERR006` | No valid numbers | Add country code, digits only |
| `ERR008` | Sender ID banned | Use a registered sender (case-sensitive) |
| `ERR009` | Empty message | Provide non-empty text |
| `ERR010` | Zero balance | Recharge at kwtsms.com |
| `ERR011` | Insufficient balance | Buy more credits |
| `ERR024` | IP not whitelisted | Add IP at Account > API > IP Lockdown |
| `ERR026` | Country not activated | Contact kwtSMS support |
| `ERR027` | HTML tags in message | Strip HTML before sending |
| `ERR028` | 15s rate limit | Wait before resending to same number |

---

## Next Steps

Once you understand the raw API, use the `kwtsms` library for production code. It handles:
- Phone number normalization (Arabic digits, `+` prefix, `00` prefix, spaces)
- Message cleaning (emoji stripping, control character removal, Arabic digit conversion)
- Input validation before API calls (no wasted requests)
- Bulk sending with auto-batching (>200 numbers split into batches with delay)
- Error enrichment (human-readable `action` hints for every error code)
- JSONL logging with password masking
- `.env` file loading

```typescript
import { KwtSMS } from 'kwtsms';
const sms = KwtSMS.fromEnv();
const result = await sms.send('96598765432', 'Your OTP for MYAPP is: 123456');
```

See [`01-basic-usage.ts`](./01-basic-usage.ts) for the library-based equivalent of this example.
