/**
 * Example 00: Raw API Calls
 *
 * Direct HTTP calls to every kwtSMS API endpoint using only node:https.
 * No library, no dependencies. Copy, paste, and run.
 *
 * This shows exactly what happens on the wire so you understand the API
 * before using the kwtsms client library.
 *
 * Run:
 *   npx tsx examples/00-raw-api.ts
 *
 * Or set credentials inline:
 *   KWTSMS_USERNAME=myuser KWTSMS_PASSWORD=mypass npx tsx examples/00-raw-api.ts
 */

import https from 'node:https';

// ── Configuration ─────────────────────────────────────────────────────────────
// Change these values to match your kwtSMS account.
// Or set KWTSMS_USERNAME / KWTSMS_PASSWORD environment variables.

const USERNAME = process.env['KWTSMS_USERNAME'] || 'js_your_api_username';
const PASSWORD = process.env['KWTSMS_PASSWORD'] || 'js_your_api_password';
const SENDER_ID = process.env['KWTSMS_SENDER_ID'] || 'KWT-SMS';
const TEST_MODE = '1';  // "1" = queued but not delivered, credits held. "0" = live.

// ── Helper: POST JSON to a kwtSMS endpoint ────────────────────────────────────

function post(endpoint: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'www.kwtsms.com',
        path: `/API/${endpoint}/`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Invalid JSON from /${endpoint}/: ${raw.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(data);
    req.end();
  });
}

// ── 1. Balance ────────────────────────────────────────────────────────────────
// POST /API/balance/  { username, password }
// Returns: { result: "OK", available: 150, purchased: 1000 }

console.log('=== 1. BALANCE ===');
const balanceResult = await post('balance', {
  username: USERNAME,
  password: PASSWORD,
});
console.log(JSON.stringify(balanceResult, null, 2));

if (balanceResult.result !== 'OK') {
  console.error('\nCredentials failed. Fix USERNAME / PASSWORD and try again.');
  console.error('These are your API credentials from kwtsms.com > Account > API.');
  process.exit(1);
}

const availableBalance = Number(balanceResult.available);
console.log(`\nAvailable: ${availableBalance} credits`);
console.log(`Purchased: ${balanceResult.purchased} credits\n`);

// ── 2. Sender IDs ─────────────────────────────────────────────────────────────
// POST /API/senderid/  { username, password }
// Returns: { result: "OK", senderid: ["KWT-SMS", "MYAPP"] }

console.log('=== 2. SENDER IDS ===');
const senderidResult = await post('senderid', {
  username: USERNAME,
  password: PASSWORD,
});
console.log(JSON.stringify(senderidResult, null, 2));

if (senderidResult.result === 'OK') {
  const ids = senderidResult.senderid as string[];
  console.log(`\nRegistered sender IDs: ${ids.join(', ')}\n`);
}

// ── 3. Coverage ───────────────────────────────────────────────────────────────
// POST /API/coverage/  { username, password }
// Returns: { result: "OK", prefixes: ["965", "966", "971", ...] }

console.log('=== 3. COVERAGE ===');
const coverageResult = await post('coverage', {
  username: USERNAME,
  password: PASSWORD,
});

if (coverageResult.result === 'OK') {
  const prefixes = coverageResult.prefixes as string[];
  console.log(`Active country prefixes (${prefixes.length}): ${prefixes.map((p) => '+' + p).join(', ')}\n`);
} else {
  console.log(JSON.stringify(coverageResult, null, 2), '\n');
}

// ── 4. Validate Numbers ──────────────────────────────────────────────────────
// POST /API/validate/  { username, password, mobile: "num1,num2" }
// Returns: { result: "OK", mobile: { OK: [...], ER: [...], NR: [...] } }

console.log('=== 4. VALIDATE NUMBERS ===');
const validateResult = await post('validate', {
  username: USERNAME,
  password: PASSWORD,
  mobile: '96598765432,96512345678,123',
});
console.log(JSON.stringify(validateResult, null, 2));

if (validateResult.result === 'OK') {
  const mobile = validateResult.mobile as Record<string, string[]>;
  console.log(`\nOK (valid):    ${JSON.stringify(mobile['OK'] ?? [])}`);
  console.log(`ER (invalid):  ${JSON.stringify(mobile['ER'] ?? [])}`);
  console.log(`NR (no route): ${JSON.stringify(mobile['NR'] ?? [])}\n`);
}

// ── 5. Send SMS ───────────────────────────────────────────────────────────────
// POST /API/send/  { username, password, sender, mobile, message, test }
// Returns: { result: "OK", msg-id: "...", numbers: 1, points-charged: 1,
//            balance-after: 149, unix-timestamp: 1684763355 }
//
// NOTE: unix-timestamp is GMT+3 (Asia/Kuwait server time), not UTC.

console.log('=== 5. SEND SMS ===');
console.log(`Test mode: ${TEST_MODE === '1' ? 'ON (queued, not delivered)' : 'OFF (live)'}`);

const sendResult = await post('send', {
  username: USERNAME,
  password: PASSWORD,
  sender: SENDER_ID,
  mobile: '96598765432',
  message: 'Hello from kwtSMS raw API example',
  test: TEST_MODE,
});
console.log(JSON.stringify(sendResult, null, 2));

let msgId = '';
if (sendResult.result === 'OK') {
  msgId = String(sendResult['msg-id']);
  console.log(`\nSent! msg-id: ${msgId}`);
  console.log(`Numbers:        ${sendResult['numbers']}`);
  console.log(`Credits charged: ${sendResult['points-charged']}`);
  console.log(`Balance after:  ${sendResult['balance-after']}`);
} else {
  console.log(`\nSend failed: ${sendResult.code}: ${sendResult.description}`);
}
console.log();

// ── 6. Message Status ─────────────────────────────────────────────────────────
// POST /API/status/  { username, password, msgid: "..." }
// Returns: { result: "OK", status: "sent", ... }
//      or: { result: "ERROR", code: "ERR030", ... }  (test mode: stuck in queue)

console.log('=== 6. MESSAGE STATUS ===');
if (msgId) {
  const statusResult = await post('status', {
    username: USERNAME,
    password: PASSWORD,
    msgid: msgId,
  });
  console.log(JSON.stringify(statusResult, null, 2));

  if (statusResult.result === 'OK') {
    console.log(`\nStatus: ${statusResult.status}`);
  } else {
    console.log(`\nStatus error: ${statusResult.code}: ${statusResult.description}`);
    if (statusResult.code === 'ERR030') {
      console.log('This is normal for test mode. The message is stuck in the queue.');
      console.log('Delete it from kwtsms.com > Queue to recover credits.');
    }
  }
} else {
  console.log('Skipped (no msg-id from previous send).');
}

console.log('\n=== DONE ===');
