/**
 * Example 03: Bulk SMS
 *
 * Demonstrates:
 *   - Sending to 500+ numbers (auto-batched into groups of 200)
 *   - Handling partial failure (some batches succeed, some fail)
 *   - Tracking msg-ids for later status checks
 *   - Validating numbers before sending
 *   - Reading batch errors
 *
 * Run:
 *   npx tsx examples/03-bulk-sms.ts
 */

import { KwtSMS, type BulkSendResult, type ValidateResult } from '../src/index.js';

const sms = KwtSMS.fromEnv();

const [ok, balance, err] = await sms.verify();
if (!ok) { console.error('Auth failed:', err); process.exit(1); }
console.log(`Balance: ${balance} credits\n`);

// ── Generate a list of 500 test numbers ──────────────────────────────────────
// In production this comes from your database.
function makeTestNumbers(count: number): string[] {
  const numbers: string[] = [];
  for (let i = 0; i < count; i++) {
    // Realistic Kuwait Zain numbers (96565xxxxxx)
    const suffix = String(i).padStart(6, '0');
    numbers.push(`96565${suffix}`);
  }
  return numbers;
}

const allNumbers = makeTestNumbers(500);
console.log(`Total numbers to send: ${allNumbers.length}`);

// ── Step 1: Validate before sending (optional but recommended for big lists) ──
// This catches format errors and numbers with no route before wasting credits.
console.log('\nValidating numbers via API...');
const validation: ValidateResult = await sms.validate(allNumbers.slice(0, 10)); // validate a sample
console.log(`  OK:       ${validation.ok.length}`);
console.log(`  ER (bad): ${validation.er.length}`);
console.log(`  NR (no route): ${validation.nr.length}`);
console.log(`  Rejected locally: ${validation.rejected.length}`);

if (validation.rejected.length > 0) {
  console.log('  Sample rejected:', validation.rejected.slice(0, 3));
}

// ── Step 2: Send the full list ────────────────────────────────────────────────
// KwtSMS auto-splits into batches of 200 with 500ms delay between each.
// This respects the API's max 2 req/s guideline.
const MESSAGE = 'Your exclusive offer from MYAPP. Reply STOP to unsubscribe.';

console.log(`\nSending to ${allNumbers.length} numbers in batches of 200...`);
console.log('(This will take a moment for multiple batches)\n');

const result = await sms.send(allNumbers, MESSAGE) as BulkSendResult;

// ── Step 3: Inspect the result ────────────────────────────────────────────────
console.log('=== Bulk Send Result ===');
console.log('Overall status:', result.result);    // 'OK', 'PARTIAL', or 'ERROR'
console.log('Batches sent:  ', result.batches);
console.log('Numbers accepted:', result.numbers);
console.log('Credits charged:', result['points-charged']);
console.log('Balance after:', result['balance-after']);

// ── Step 4: Save msg-ids for delivery tracking ────────────────────────────────
// You MUST save these — they're the only way to check delivery status later.
if (result['msg-ids'].length > 0) {
  console.log('\nMessage IDs (save to your DB for DLR tracking):');
  result['msg-ids'].forEach((id, idx) => {
    console.log(`  Batch ${idx + 1}: ${id}`);
  });
}

// ── Step 5: Handle errors ─────────────────────────────────────────────────────
if (result.errors.length > 0) {
  console.log('\nBatch errors:');
  result.errors.forEach(({ batch, code, description }) => {
    console.log(`  Batch ${batch}: [${code}] ${description}`);
  });
}

// ── Step 6: Handle invalid numbers ───────────────────────────────────────────
if (result.invalid && result.invalid.length > 0) {
  console.log(`\nLocally-rejected numbers (${result.invalid.length}):`);
  result.invalid.slice(0, 5).forEach(({ input, error }) => {
    console.log(`  ${input} → ${error}`);
  });
}

// ── Step 7: Partial failure handling ─────────────────────────────────────────
if (result.result === 'PARTIAL') {
  console.log('\nPARTIAL: Some batches failed.');
  console.log('You can retry failed batches using the batch numbers in result.errors.');
  console.log('Successful msg-ids are in result[\'msg-ids\'] — those were delivered.');
}

if (result.result === 'ERROR') {
  console.log('\nAll batches failed — check your balance and credentials.');
}

console.log('\nDone.');
