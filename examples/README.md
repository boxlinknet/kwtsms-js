# Examples

Runnable TypeScript examples for the `kwtsms` library.

## Prerequisites

```bash
npm install
```

To run `.ts` examples directly (without compiling):

```bash
npm install --save-dev tsx
```

Set up credentials in `.env`:

```
KWTSMS_USERNAME=your_api_username
KWTSMS_PASSWORD=your_api_password
KWTSMS_SENDER_ID=KWT-SMS
KWTSMS_TEST_MODE=1
```

## Examples

| File | What it covers |
|------|----------------|
| [`00-raw-api.ts`](./00-raw-api.ts) | Raw HTTP calls to every kwtSMS endpoint, no library, copy-paste ready |
| [`01-basic-usage.ts`](./01-basic-usage.ts) | Create client, verify credentials, check balance, send SMS |
| [`02-otp-flow.ts`](./02-otp-flow.ts) | OTP send + verify, expiry, resend cooldown, replay protection |
| [`03-bulk-sms.ts`](./03-bulk-sms.ts) | 500+ numbers, auto-batching, partial failure, msg-id tracking |
| [`04-express-endpoint.ts`](./04-express-endpoint.ts) | Express.js API endpoint with rate limiting and CAPTCHA |
| [`05-nextjs-route.ts`](./05-nextjs-route.ts) | Next.js App Router route handlers |

Each `.ts` file has a companion `.md` file with detailed explanation, code snippets, and a production checklist.

## Run

```bash
# From repo root:
npx tsx examples/00-raw-api.ts           # raw HTTP calls, no library
npx tsx examples/01-basic-usage.ts
npx tsx examples/02-otp-flow.ts
npx tsx examples/03-bulk-sms.ts
npx tsx examples/04-express-endpoint.ts  # starts a server on :3000

# 05-nextjs-route.ts is a reference — copy handlers into your Next.js project
```
