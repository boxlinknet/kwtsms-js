/**
 * Integration tests — hit the live kwtSMS API.
 *
 * All tests SKIPPED if KWTSMS_USERNAME or KWTSMS_PASSWORD are not set.
 * Always uses testMode=true. Credits are held in queue (recover by deleting
 * test messages from kwtsms.com Queue).
 *
 * Credit budget (known before any sends):
 *   - Basic sends:     3  (mixed, +prefix, valid number)
 *   - Client bulk:   250  (200 + 50 batches)
 *   - CLI bulk:      250  (200 + 50 batches)
 *   - Total:         503
 *
 * To run:
 *   KWTSMS_USERNAME=user KWTSMS_PASSWORD=pass node --import tsx/esm --test test/integration.test.ts
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KwtSMS, type BulkSendResult } from '../src/client.ts';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');
const PROJECT_ROOT = join(__dirname, '..');

const HAS_CREDS = !!(process.env['KWTSMS_USERNAME'] && process.env['KWTSMS_PASSWORD']);
const KUWAIT_NUMBER = process.env['KWTSMS_TEST_NUMBER'] ?? '96598000001';

// ── Credit budget ─────────────────────────────────────────────────────────────
// Every send() in test mode holds credits in the queue (1 credit per number).
// These constants let every test verify balance-after precisely.

const CREDITS_BASIC_SENDS  = 3;    // 3 individual send() calls (1 number each)
const CREDITS_CLIENT_BULK  = 250;  // bulk send: 200 + 50
const CREDITS_CLI_BULK     = 250;  // CLI bulk send: 200 + 50
const TOTAL_CREDITS_NEEDED = CREDITS_BASIC_SENDS + CREDITS_CLIENT_BULK + CREDITS_CLI_BULK; // 503

// ── Shared state across all suites ────────────────────────────────────────────

let initialBalance: number | null = null;
let hasBudget = false; // true if balance >= TOTAL_CREDITS_NEEDED

/** Generate N unique Kuwait test numbers in format 9659922XXXX. */
function generateTestNumbers(count: number): string[] {
  const numbers: string[] = [];
  for (let i = 0; i < count; i++) {
    numbers.push(`9659922${String(i).padStart(4, '0')}`);
  }
  return numbers;
}

function skipIf(condition: boolean, name: string, fnOrOpts: (() => void | Promise<void>) | Record<string, unknown>, maybeFn?: () => void | Promise<void>): void {
  const fn = typeof fnOrOpts === 'function' ? fnOrOpts : maybeFn!;
  const opts = typeof fnOrOpts === 'function' ? undefined : fnOrOpts;
  if (condition) {
    test(`[SKIPPED — no credentials] ${name}`, () => {});
    return;
  }
  if (opts) {
    test(name, opts, fn);
  } else {
    test(name, fn);
  }
}

// ── Initial balance check (runs before everything) ───────────────────────────

describe('Integration: initial balance check', () => {
  skipIf(!HAS_CREDS, `balance() — record initial balance (need >= ${TOTAL_CREDITS_NEEDED} credits)`, async () => {
    const sms = new KwtSMS(
      process.env['KWTSMS_USERNAME']!,
      process.env['KWTSMS_PASSWORD']!,
      { testMode: true, logFile: '' },
    );
    const [ok, bal, err] = await sms.verify();
    assert.equal(ok, true, `verify failed: ${err}`);
    assert.ok(typeof bal === 'number', 'balance should be a number');
    initialBalance = bal;
    hasBudget = bal >= TOTAL_CREDITS_NEEDED;
    console.log(`  Initial balance: ${bal}`);
    console.log(`  Credits needed:  ${TOTAL_CREDITS_NEEDED} (basic=${CREDITS_BASIC_SENDS} + client_bulk=${CREDITS_CLIENT_BULK} + cli_bulk=${CREDITS_CLI_BULK})`);
    if (!hasBudget) {
      console.log(`  ⚠ Insufficient balance. Send tests will be skipped.`);
      console.log('    Delete test messages from kwtsms.com Queue to recover credits.');
    }
  });
});

// ── Basic API tests ───────────────────────────────────────────────────────────

describe('Integration: kwtSMS API (testMode=true)', () => {
  let sms: KwtSMS;

  before(() => {
    if (!HAS_CREDS) return;
    sms = new KwtSMS(
      process.env['KWTSMS_USERNAME']!,
      process.env['KWTSMS_PASSWORD']!,
      { testMode: true, logFile: '' },
    );
  });

  // ── Tests that consume zero credits ──

  skipIf(!HAS_CREDS, 'verify() — wrong credentials return ok=false with auth error', async () => {
    const bad = new KwtSMS('js_wronguser', 'js_wrongpass', { logFile: '' });
    const [ok, , err] = await bad.verify();
    assert.equal(ok, false);
    assert.ok(err, 'error should be set');
  });

  skipIf(!HAS_CREDS, 'send() — email input rejected locally (no API call, 0 credits)', async () => {
    const result = await sms.send('test@example.com', 'test');
    assert.equal(result.result, 'ERROR');
    assert.equal((result as { code?: string }).code, 'ERR_INVALID_INPUT');
  });

  skipIf(!HAS_CREDS, 'send() — too-short number rejected locally (0 credits)', async () => {
    const result = await sms.send('123', 'test');
    assert.equal(result.result, 'ERROR');
    assert.equal((result as { code?: string }).code, 'ERR_INVALID_INPUT');
  });

  skipIf(!HAS_CREDS, 'validate() — returns ok, er, nr arrays (0 credits)', async () => {
    const result = await sms.validate([KUWAIT_NUMBER, `+${KUWAIT_NUMBER}`]);
    assert.ok(Array.isArray(result.ok));
    assert.ok(Array.isArray(result.er));
    assert.ok(Array.isArray(result.nr));
  });

  skipIf(!HAS_CREDS, 'senderids() — returns result and senderids array', async () => {
    const result = await sms.senderids();
    assert.equal(result.result, 'OK');
    assert.ok(Array.isArray(result.senderids));
  });

  skipIf(!HAS_CREDS, 'coverage() — returns result from API', async () => {
    const result = await sms.coverage();
    assert.ok(['OK', 'ERROR'].includes(result.result));
  });

  // ── Tests that consume credits (3 total) ──

  skipIf(!HAS_CREDS, 'send() — mixed valid+invalid reports both (1 credit)', async () => {
    if (!hasBudget) { console.log('  [SKIPPED — insufficient balance]'); return; }
    const result = await sms.send([KUWAIT_NUMBER, 'abc', ''], 'Integration test');
    assert.ok('invalid' in result, 'invalid field should exist');
    const inv = (result as { invalid: unknown[] }).invalid;
    assert.ok(Array.isArray(inv));
    assert.equal(inv.length, 2);
  });

  skipIf(!HAS_CREDS, 'send() — + prefix normalized and sent to API (1 credit)', async () => {
    if (!hasBudget) { console.log('  [SKIPPED — insufficient balance]'); return; }
    const result = await sms.send(`+${KUWAIT_NUMBER}`, 'Normalize + prefix test');
    assert.ok(['OK', 'ERROR'].includes(result.result), `unexpected result: ${result.result}`);
    if (result.result === 'ERROR') assert.ok((result as { code?: string }).code);
  });

  skipIf(!HAS_CREDS, 'send() — valid Kuwait number result is OK (1 credit)', async () => {
    if (!hasBudget) { console.log('  [SKIPPED — insufficient balance]'); return; }
    const result = await sms.send(KUWAIT_NUMBER, 'kwtSMS JS integration test');
    assert.ok(['OK', 'ERROR'].includes(result.result));
    if (result.result === 'ERROR') assert.ok((result as { code?: string }).code);
  });

  skipIf(!HAS_CREDS, `balance after basic sends should be initialBalance - ${CREDITS_BASIC_SENDS}`, async () => {
    if (!hasBudget) { console.log('  [SKIPPED — no sends were made]'); return; }
    const [ok, bal, err] = await sms.verify();
    assert.equal(ok, true, `verify failed: ${err}`);
    const expected = initialBalance! - CREDITS_BASIC_SENDS;
    assert.equal(bal, expected, `expected balance ${expected} (initial ${initialBalance} - ${CREDITS_BASIC_SENDS}), got ${bal}`);
    console.log(`  Balance after basic sends: ${bal} (consumed ${CREDITS_BASIC_SENDS}, expected ${expected})`);
  });
});

// ── Client library: bulk send 250 numbers + status check ──────────────────────

describe('Integration: client bulk send (250 numbers, testMode=true)', () => {
  let sms: KwtSMS;
  let bulkResult: BulkSendResult | null = null;

  before(() => {
    if (!HAS_CREDS) return;
    sms = new KwtSMS(
      process.env['KWTSMS_USERNAME']!,
      process.env['KWTSMS_PASSWORD']!,
      { testMode: true, logFile: '' },
    );
  });

  skipIf(!HAS_CREDS, `send() with 250 numbers triggers bulk send, 2 batches (${CREDITS_CLIENT_BULK} credits)`, { timeout: 60_000 }, async () => {
    if (!hasBudget) { console.log('  [SKIPPED — insufficient balance]'); return; }

    const numbers = generateTestNumbers(250);
    assert.equal(numbers.length, 250);

    const result = await sms.send(numbers, 'JS bulk integration test');

    assert.ok('bulk' in result, 'result should be a BulkSendResult');
    const bulk = result as BulkSendResult;
    bulkResult = bulk;

    assert.equal(bulk.bulk, true);
    assert.equal(bulk.result, 'OK', `bulk send failed: ${bulk.code ?? ''} ${bulk.description ?? ''}`);
    assert.equal(bulk.batches, 2, 'should split into 2 batches (200 + 50)');
    assert.equal(bulk.numbers, 250, 'total recipients should be 250');
    assert.equal(bulk['msg-ids'].length, 2, 'should have 2 msg-ids (one per batch)');

    for (const id of bulk['msg-ids']) {
      assert.ok(id.length > 0, `msg-id should be non-empty, got: "${id}"`);
    }

    assert.ok(typeof bulk['balance-after'] === 'number', 'balance-after should be a number');
    assert.ok(bulk.errors.length === 0, `bulk send had errors: ${JSON.stringify(bulk.errors)}`);
  });

  skipIf(!HAS_CREDS, `balance after client bulk should be initialBalance - ${CREDITS_BASIC_SENDS + CREDITS_CLIENT_BULK}`, async () => {
    if (!bulkResult) { console.log('  [SKIPPED — bulk send did not complete]'); return; }
    const expected = initialBalance! - CREDITS_BASIC_SENDS - CREDITS_CLIENT_BULK;
    const actual = bulkResult['balance-after']!;
    assert.equal(actual, expected, `expected balance ${expected} (initial ${initialBalance} - ${CREDITS_BASIC_SENDS} - ${CREDITS_CLIENT_BULK}), got ${actual}`);
    console.log(`  Balance after client bulk: ${actual} (consumed ${CREDITS_BASIC_SENDS + CREDITS_CLIENT_BULK} total, expected ${expected})`);
  });

  skipIf(!HAS_CREDS, 'status() for batch 1 msg-id returns ERR030 (test mode, stuck in queue)', { timeout: 15_000 }, async () => {
    if (!bulkResult || bulkResult['msg-ids'].length < 1) {
      console.log('  [SKIPPED — no msg-id from batch 1]');
      return;
    }
    const msgId = bulkResult['msg-ids'][0];
    const status = await sms.status(msgId);
    assert.equal(status.result, 'ERROR');
    assert.equal(status.code, 'ERR030', `expected ERR030, got ${status.code}: ${status.description}`);
  });

  skipIf(!HAS_CREDS, 'status() for batch 2 msg-id returns ERR030 (test mode, stuck in queue)', { timeout: 15_000 }, async () => {
    if (!bulkResult || bulkResult['msg-ids'].length < 2) {
      console.log('  [SKIPPED — no msg-id from batch 2]');
      return;
    }
    const msgId = bulkResult['msg-ids'][1];
    const status = await sms.status(msgId);
    assert.equal(status.result, 'ERROR');
    assert.equal(status.code, 'ERR030', `expected ERR030, got ${status.code}: ${status.description}`);
  });
});

// ── CLI: bulk send 250 numbers + status check ─────────────────────────────────

describe('Integration: CLI bulk send (250 numbers, testMode=true)', () => {
  let msgIds: string[] = [];

  const cliEnv: Record<string, string> = {
    KWTSMS_USERNAME: process.env['KWTSMS_USERNAME'] ?? '',
    KWTSMS_PASSWORD: process.env['KWTSMS_PASSWORD'] ?? '',
    KWTSMS_SENDER_ID: 'KWT-SMS',
    KWTSMS_TEST_MODE: '1',
    KWTSMS_LOG_FILE: '',
    PATH: process.env['PATH'] ?? '',
    NODE_PATH: process.env['NODE_PATH'] ?? '',
    HOME: process.env['HOME'] ?? '',
    SYSTEMROOT: process.env['SYSTEMROOT'] ?? '',
  };

  skipIf(!HAS_CREDS, `kwtsms send with 250 numbers produces bulk output (${CREDITS_CLI_BULK} credits)`, { timeout: 120_000 }, async () => {
    if (!hasBudget) { console.log('  [SKIPPED — insufficient balance]'); return; }

    const numbers = generateTestNumbers(250);
    const mobileArg = numbers.join(',');

    const { stdout, stderr } = await execFileAsync(
      'node',
      ['--import', 'tsx/esm', CLI_PATH, 'send', mobileArg, 'JS CLI bulk test'],
      { cwd: PROJECT_ROOT, env: cliEnv, timeout: 120_000 },
    );

    const output = stdout + stderr;

    assert.ok(output.includes('batches:'), `output should mention batches: ${output}`);
    assert.ok(output.includes('numbers:'), `output should mention numbers: ${output}`);
    assert.ok(output.includes('balance-after:'), `output should mention balance-after: ${output}`);
    assert.ok(output.includes('TEST MODE'), 'should show test mode warning');
    assert.ok(output.includes('msg-ids:'), 'should print msg-ids line');

    // Parse msg-ids from output: "  msg-ids: id1, id2"
    const msgIdLine = output.split('\n').find((l: string) => l.includes('msg-ids:'));
    assert.ok(msgIdLine, 'should have a msg-ids line');
    const idsPart = msgIdLine!.split('msg-ids:')[1].trim();
    msgIds = idsPart.split(',').map((s: string) => s.trim()).filter(Boolean);
    assert.equal(msgIds.length, 2, `should have 2 msg-ids, got: ${JSON.stringify(msgIds)}`);

    // Verify batches: 2 and numbers: 250 in output
    const batchMatch = output.match(/batches:\s*(\d+)/);
    assert.ok(batchMatch, 'should contain batches count');
    assert.equal(batchMatch![1], '2');

    const numMatch = output.match(/numbers:\s*(\d+)/);
    assert.ok(numMatch, 'should contain numbers count');
    assert.equal(numMatch![1], '250');

    // Verify balance-after matches expected
    const balMatch = output.match(/balance-after:\s*([\d.]+)/);
    assert.ok(balMatch, 'should contain balance-after value');
    const expected = initialBalance! - CREDITS_BASIC_SENDS - CREDITS_CLIENT_BULK - CREDITS_CLI_BULK;
    assert.equal(Number(balMatch![1]), expected,
      `expected balance ${expected} (initial ${initialBalance} - ${TOTAL_CREDITS_NEEDED}), got ${balMatch![1]}`);
    console.log(`  Balance after CLI bulk: ${balMatch![1]} (consumed ${TOTAL_CREDITS_NEEDED} total, expected ${expected})`);
  });

  skipIf(!HAS_CREDS, 'kwtsms status <msg-id> for batch 1 returns ERR030', { timeout: 15_000 }, async () => {
    if (msgIds.length < 1) {
      console.log('  [SKIPPED — no msg-id from CLI bulk send]');
      return;
    }

    try {
      await execFileAsync(
        'node',
        ['--import', 'tsx/esm', CLI_PATH, 'status', msgIds[0]],
        { cwd: PROJECT_ROOT, env: cliEnv, timeout: 15_000 },
      );
      assert.fail('status should exit non-zero for ERR030');
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      const output = (err.stdout ?? '') + (err.stderr ?? '');
      assert.ok(output.includes('ERR030'), `expected ERR030 in output: ${output}`);
    }
  });

  skipIf(!HAS_CREDS, 'kwtsms status <msg-id> for batch 2 returns ERR030', { timeout: 15_000 }, async () => {
    if (msgIds.length < 2) {
      console.log('  [SKIPPED — no msg-id from CLI bulk send batch 2]');
      return;
    }

    try {
      await execFileAsync(
        'node',
        ['--import', 'tsx/esm', CLI_PATH, 'status', msgIds[1]],
        { cwd: PROJECT_ROOT, env: cliEnv, timeout: 15_000 },
      );
      assert.fail('status should exit non-zero for ERR030');
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      const output = (err.stdout ?? '') + (err.stderr ?? '');
      assert.ok(output.includes('ERR030'), `expected ERR030 in output: ${output}`);
    }
  });
});
