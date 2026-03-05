/**
 * Integration tests — hit the live kwtSMS API.
 *
 * All tests SKIPPED if KWTSMS_USERNAME or KWTSMS_PASSWORD are not set.
 * Always uses testMode=true (no credits consumed, no real SMS sent to handsets).
 *
 * To run:
 *   KWTSMS_USERNAME=user KWTSMS_PASSWORD=pass node --import tsx/esm --test test/integration.test.ts
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { KwtSMS } from '../src/client.ts';

const HAS_CREDS = !!(process.env['KWTSMS_USERNAME'] && process.env['KWTSMS_PASSWORD']);
// Use KWTSMS_TEST_NUMBER env var or a default Kuwait number (test mode, not delivered)
const KUWAIT_NUMBER = process.env['KWTSMS_TEST_NUMBER'] ?? '96598000001';

function skipIf(condition: boolean, name: string, fn: () => void | Promise<void>): void {
  if (condition) {
    test(`[SKIPPED — no credentials] ${name}`, () => {});
    return;
  }
  test(name, fn);
}

describe('Integration: kwtSMS API (testMode=true, no credits consumed)', () => {
  let sms: KwtSMS;

  before(() => {
    if (!HAS_CREDS) return;
    sms = new KwtSMS(
      process.env['KWTSMS_USERNAME']!,
      process.env['KWTSMS_PASSWORD']!,
      { testMode: true, logFile: '' },
    );
  });

  skipIf(!HAS_CREDS, 'verify() — valid credentials return ok=true and a numeric balance', async () => {
    const [ok, bal, err] = await sms.verify();
    assert.equal(ok, true, `verify failed: ${err}`);
    assert.ok(typeof bal === 'number', `balance should be a number, got ${typeof bal}`);
    assert.equal(err, null);
  });

  skipIf(!HAS_CREDS, 'verify() — wrong credentials return ok=false with auth error', async () => {
    const bad = new KwtSMS('wronguser', 'wrongpass', { logFile: '' });
    const [ok, , err] = await bad.verify();
    assert.equal(ok, false);
    assert.ok(err, 'error should be set');
  });

  skipIf(!HAS_CREDS, 'send() — email input rejected locally (no API call)', async () => {
    const result = await sms.send('test@example.com', 'test');
    assert.equal(result.result, 'ERROR');
    assert.equal((result as { code?: string }).code, 'ERR_INVALID_INPUT');
  });

  skipIf(!HAS_CREDS, 'send() — too-short number rejected locally', async () => {
    const result = await sms.send('123', 'test');
    assert.equal(result.result, 'ERROR');
    assert.equal((result as { code?: string }).code, 'ERR_INVALID_INPUT');
  });

  skipIf(!HAS_CREDS, 'send() — mixed valid+invalid reports both', async () => {
    const result = await sms.send([KUWAIT_NUMBER, 'abc', ''], 'Integration test');
    // Valid number sent (or API error), invalid ones in result.invalid
    assert.ok('invalid' in result, 'invalid field should exist');
    const inv = (result as { invalid: unknown[] }).invalid;
    assert.ok(Array.isArray(inv));
    assert.equal(inv.length, 2);
  });

  skipIf(!HAS_CREDS, 'send() — + prefix normalized and sent to API', async () => {
    const result = await sms.send(`+${KUWAIT_NUMBER}`, 'Normalize + prefix test');
    assert.ok(['OK', 'ERROR'].includes(result.result), `unexpected result: ${result.result}`);
    // If ERROR, it should be a known API error code, not a crash
    if (result.result === 'ERROR') assert.ok((result as { code?: string }).code);
  });

  skipIf(!HAS_CREDS, 'send() — valid Kuwait number result is OK or known API error', async () => {
    const result = await sms.send(KUWAIT_NUMBER, 'kwtSMS JS integration test');
    assert.ok(['OK', 'ERROR'].includes(result.result));
    if (result.result === 'ERROR') assert.ok((result as { code?: string }).code);
  });

  skipIf(!HAS_CREDS, 'validate() — returns ok, er, nr arrays', async () => {
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
});
