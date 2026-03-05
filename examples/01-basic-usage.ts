/**
 * Example 01: Basic Usage
 *
 * Demonstrates:
 *   - Creating a client with fromEnv() or explicit credentials
 *   - Verifying credentials
 *   - Checking balance
 *   - Sending a single SMS
 *
 * Run:
 *   KWTSMS_USERNAME=myuser KWTSMS_PASSWORD=mypass npx tsx examples/01-basic-usage.ts
 *
 * Or create a .env file with KWTSMS_USERNAME and KWTSMS_PASSWORD, then:
 *   npx tsx examples/01-basic-usage.ts
 */

import { KwtSMS } from '../src/index.js';

// ── Option A: Load from environment / .env file ──────────────────────────────
// Reads KWTSMS_USERNAME, KWTSMS_PASSWORD, KWTSMS_SENDER_ID, KWTSMS_TEST_MODE
const sms = KwtSMS.fromEnv();

// ── Option B: Explicit credentials ───────────────────────────────────────────
// const sms = new KwtSMS('myuser', 'mypass', {
//   senderId: 'MYAPP',   // your registered sender ID
//   testMode: true,      // true = queued but not delivered; no credits consumed
// });

// ── Step 1: Verify credentials and get balance ───────────────────────────────
console.log('Verifying credentials...');
const [ok, balance, error] = await sms.verify();

if (!ok) {
  console.error('Credentials failed:', error);
  process.exit(1);
}

console.log(`Credentials OK. Balance: ${balance} credits`);

// ── Step 2: Check balance any time ───────────────────────────────────────────
const currentBalance = await sms.balance();
console.log(`Current balance: ${currentBalance} credits`);

// Cached balance from last API call — no extra request
console.log(`Cached balance: ${sms.cachedBalance} credits`);

// ── Step 3: List available sender IDs ────────────────────────────────────────
const senderIdResult = await sms.senderids();
if (senderIdResult.result === 'OK') {
  console.log('Sender IDs:', senderIdResult.senderids);
}

// ── Step 4: Send a single SMS ─────────────────────────────────────────────────
// Replace with a real number for a live send.
// With testMode: true, the message is queued but never delivered.
const TO = '96598765432';
const MESSAGE = 'Hello from kwtsms! Your test message.';

console.log(`\nSending SMS to ${TO}...`);
const result = await sms.send(TO, MESSAGE);

if (result.result === 'OK') {
  // Save msg-id — needed later for /status/ and /dlr/ calls
  console.log('Sent successfully!');
  console.log('  msg-id:', (result as any)['msg-id']);
  console.log('  credits charged:', (result as any)['points-charged']);
  console.log('  balance after:', (result as any)['balance-after']);
} else {
  console.error('Send failed:', result.description);
  // result.action contains a human-readable fix hint for known error codes
  if (result.action) {
    console.error('Hint:', result.action);
  }
}

// ── Step 5: Invalid number — see how it fails gracefully ─────────────────────
const badResult = await sms.send('not-a-number', 'test');
console.log('\nInvalid number result:', badResult.result, badResult.description);
