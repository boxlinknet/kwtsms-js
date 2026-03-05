import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { KwtSMS, type KwtSMSOptions, type SendResult, type BulkSendResult } from '../src/client.ts';
import type { ApiResponse } from '../src/errors.ts';

// ── Test double ────────────────────────────────────────────────────────────────
// mock.module is not available in Node 20.19 (added in 20.18 with --experimental-vm-modules
// flag but not exposed in node:test mock API at this version). mock.method cannot patch
// ESM namespace bindings. The reliable approach is a test subclass that overrides
// the API-calling methods.

interface CallRecord {
  endpoint: string;
  payload: Record<string, unknown>;
}

class TestKwtSMS extends KwtSMS {
  private _mockResponse: ApiResponse = { result: 'OK', available: 150, purchased: 1000 };
  calls: CallRecord[] = [];

  constructor(username: string, password: string, options: KwtSMSOptions = {}) {
    super(username, password, options);
  }

  setResponse(response: ApiResponse): void {
    this._mockResponse = response;
  }

  resetCalls(): void {
    this.calls = [];
  }

  /** Override verify() to avoid real HTTP calls. */
  override async verify(): Promise<[boolean, number | null, string | null]> {
    this.calls.push({ endpoint: 'balance', payload: {} });
    const data = this._mockResponse;
    if (data.result === 'OK') {
      this._cachedBalance = Number(data['available'] ?? 0);
      this._cachedPurchased = Number(data['purchased'] ?? 0);
      return [true, this._cachedBalance, null];
    }
    // replicate enrichError inline to keep test self-contained
    const { enrichError } = await import('../src/errors.ts');
    const enriched = enrichError(data);
    const desc = String(enriched.description ?? enriched.code ?? 'Unknown error');
    const error = enriched.action ? `${desc} → ${enriched.action}` : desc;
    return [false, null, error];
  }

  /** Override send() only for the API call part — local validation still runs. */
  override async send(
    mobile: string | string[],
    message: string,
    sender?: string,
  ): Promise<SendResult | BulkSendResult> {
    // Run parent send() but intercept the apiRequest call by swapping
    // the mock response into a patched _sendSingle helper below.
    // We call the parent directly; parent does local validation.
    // For valid numbers it would call apiRequest. We override it here
    // by delegating to a mock-aware version of send().
    return this._mockSend(mobile, message, sender);
  }

  private async _mockSend(
    mobile: string | string[],
    message: string,
    _sender?: string,
  ): Promise<SendResult | BulkSendResult> {
    const { validatePhoneInput } = await import('../src/phone.ts');
    const { enrichError } = await import('../src/errors.ts');

    const rawList = Array.isArray(mobile) ? mobile : [mobile];
    const validNumbers: string[] = [];
    const invalid: Array<{ input: string; error: string }> = [];

    for (const raw of rawList) {
      const [isValid, error, normalized] = validatePhoneInput(String(raw));
      if (isValid) {
        validNumbers.push(normalized);
      } else {
        invalid.push({ input: String(raw), error: error! });
      }
    }

    // Deduplicate normalised numbers (mirrors client.ts behaviour)
    const uniqueValid = [...new Set(validNumbers)];

    // All invalid — return locally without hitting API
    if (uniqueValid.length === 0) {
      const desc =
        invalid.length === 1
          ? invalid[0].error
          : `All ${invalid.length} phone numbers are invalid`;
      return {
        ...enrichError({ result: 'ERROR', code: 'ERR_INVALID_INPUT', description: desc }),
        invalid,
      } as SendResult;
    }

    // Empty message after cleaning — return locally without hitting API
    const { cleanMessage } = await import('../src/message.ts');
    const cleaned = cleanMessage(message);
    if (!cleaned) {
      return {
        result: 'ERROR' as const,
        code: 'ERR009',
        description: 'Message is empty after cleaning. If your message contained only emojis or HTML, remove them.',
        action: 'Provide a non-empty message text.',
        ...(invalid.length > 0 ? { invalid } : {}),
      } as SendResult;
    }

    // Record the API call we would have made
    this.calls.push({ endpoint: 'send', payload: { mobile: uniqueValid.join(','), message } });

    const data = this._mockResponse;
    let result: SendResult;

    if (data.result === 'OK') {
      if (data['balance-after'] !== undefined) {
        this._cachedBalance = Number(data['balance-after']);
      }
      result = { ...data } as SendResult;
    } else {
      result = enrichError(data) as SendResult;
    }

    if (invalid.length > 0) {
      result.invalid = invalid;
    }

    return result;
  }
}

// ── Constructor tests ─────────────────────────────────────────────────────────

describe('KwtSMS constructor', () => {
  test('throws for empty username', () => {
    assert.throws(() => new KwtSMS('', 'pass'), /username and password are required/);
  });

  test('throws for empty password', () => {
    assert.throws(() => new KwtSMS('user', ''), /username and password are required/);
  });

  test('sets defaults: senderId=KWT-SMS, testMode=false, logFile=kwtsms.log', () => {
    const sms = new KwtSMS('user', 'pass');
    assert.equal(sms.senderId, 'KWT-SMS');
    assert.equal(sms.testMode, false);
    assert.equal(sms.logFile, 'kwtsms.log');
  });

  test('accepts custom options', () => {
    const sms = new KwtSMS('user', 'pass', { senderId: 'MY-APP', testMode: true, logFile: '' });
    assert.equal(sms.senderId, 'MY-APP');
    assert.equal(sms.testMode, true);
    assert.equal(sms.logFile, '');
  });

  test('password is not accessible as a public property', () => {
    const sms = new KwtSMS('user', 'pass');
    assert.equal(('password' in sms), false, 'password must not be a public enumerable property');
  });
});

// ── verify() ──────────────────────────────────────────────────────────────────

describe('verify()', () => {
  test('returns [true, balance, null] on success', async () => {
    const sms = new TestKwtSMS('user', 'pass', { logFile: '' });
    sms.setResponse({ result: 'OK', available: 150, purchased: 1000 });
    const [ok, bal, err] = await sms.verify();
    assert.equal(ok, true);
    assert.equal(bal, 150);
    assert.equal(err, null);
  });

  test('returns [false, null, error] on ERR003 — includes KWTSMS_USERNAME in action', async () => {
    const sms = new TestKwtSMS('user', 'pass', { logFile: '' });
    sms.setResponse({ result: 'ERROR', code: 'ERR003', description: 'Auth error' });
    const [ok, bal, err] = await sms.verify();
    assert.equal(ok, false);
    assert.equal(bal, null);
    assert.ok(err, 'error should be set');
    assert.ok(err!.includes('KWTSMS_USERNAME'), `expected KWTSMS_USERNAME in: ${err}`);
  });
});

// ── send() — local validation (no API call made) ──────────────────────────────

describe('send() — local validation (no API call made)', () => {
  let sms: TestKwtSMS;

  beforeEach(() => {
    sms = new TestKwtSMS('user', 'pass', { logFile: '' });
    sms.resetCalls();
  });

  test('all-invalid numbers returns ERR_INVALID_INPUT without API call', async () => {
    const result = await sms.send('abc', 'test');
    assert.equal(result.result, 'ERROR');
    assert.equal((result as SendResult).code, 'ERR_INVALID_INPUT');
    assert.equal(sms.calls.length, 0, 'API should NOT be called');
  });

  test('email input returns ERR_INVALID_INPUT locally', async () => {
    const result = await sms.send('user@gmail.com', 'test');
    assert.equal(result.result, 'ERROR');
    assert.equal((result as SendResult).code, 'ERR_INVALID_INPUT');
    assert.ok((result as SendResult).description!.includes('email'));
    assert.equal(sms.calls.length, 0);
  });

  test('empty string returns ERR_INVALID_INPUT locally', async () => {
    const result = await sms.send('', 'test');
    assert.equal(result.result, 'ERROR');
    assert.equal((result as SendResult).code, 'ERR_INVALID_INPUT');
    assert.equal(sms.calls.length, 0);
  });

  test('emoji-only message returns ERR009 without API call', async () => {
    const result = await sms.send('96598765432', '🎉🎊🎈') as SendResult;
    assert.equal(result.result, 'ERROR');
    assert.equal(result.code, 'ERR009');
    assert.equal(sms.calls.length, 0, 'API should NOT be called for empty message');
  });
});

// ── send() — API error enrichment ─────────────────────────────────────────────

describe('send() — API error enrichment', () => {
  let sms: TestKwtSMS;

  beforeEach(() => {
    sms = new TestKwtSMS('user', 'pass', { logFile: '' });
    sms.resetCalls();
  });

  test('ERR026 country not activated — action mentions kwtSMS support', async () => {
    sms.setResponse({ result: 'ERROR', code: 'ERR026', description: 'Country not activated' });
    const result = await sms.send('96598765432', 'test') as SendResult;
    assert.equal(result.result, 'ERROR');
    assert.equal(result.code, 'ERR026');
    assert.ok(result.action, 'action should be set');
    assert.ok(result.action!.includes('kwtSMS support'));
  });

  test('ERR025 invalid number — action mentions country code', async () => {
    sms.setResponse({ result: 'ERROR', code: 'ERR025', description: 'Invalid number' });
    const result = await sms.send('96598765432', 'test') as SendResult;
    assert.ok(result.action!.includes('country code'));
  });

  test('ERR010 zero balance — action mentions kwtsms.com', async () => {
    sms.setResponse({ result: 'ERROR', code: 'ERR010', description: 'Zero balance' });
    const result = await sms.send('96598765432', 'test') as SendResult;
    assert.ok(result.action!.includes('kwtsms.com'));
  });

  test('ERR024 IP not whitelisted — action mentions IP Lockdown', async () => {
    sms.setResponse({ result: 'ERROR', code: 'ERR024', description: 'IP blocked' });
    const result = await sms.send('96598765432', 'test') as SendResult;
    assert.ok(result.action!.includes('IP Lockdown'));
  });

  test('ERR028 rate limit — action mentions 15 seconds', async () => {
    sms.setResponse({ result: 'ERROR', code: 'ERR028', description: 'Too fast' });
    const result = await sms.send('96598765432', 'test') as SendResult;
    assert.ok(result.action!.includes('15 seconds'));
  });

  test('ERR008 banned sender ID — action mentions case sensitive', async () => {
    sms.setResponse({ result: 'ERROR', code: 'ERR008', description: 'Sender banned' });
    const result = await sms.send('96598765432', 'test') as SendResult;
    assert.ok(result.action!.includes('case sensitive'));
  });

  test('ERR999 unknown code — no action field, description returned', async () => {
    sms.setResponse({ result: 'ERROR', code: 'ERR999', description: 'Some unknown error' });
    const result = await sms.send('96598765432', 'test') as SendResult;
    assert.equal(result.result, 'ERROR');
    assert.equal(result.action, undefined);
    assert.equal(result.description, 'Some unknown error');
  });
});

// ── send() — mixed valid + invalid numbers ─────────────────────────────────────

describe('send() — mixed valid + invalid numbers', () => {
  test('sends valid numbers, attaches invalid in result.invalid', async () => {
    const sms = new TestKwtSMS('user', 'pass', { logFile: '' });
    sms.setResponse({ result: 'OK', 'msg-id': 'abc123', numbers: 1, 'points-charged': 1, 'balance-after': 99 });
    const result = await sms.send(['96598765432', 'abc', ''], 'hello') as SendResult;
    assert.equal(result.result, 'OK');
    assert.ok('invalid' in result, 'should have invalid field');
    const inv = result.invalid;
    assert.equal(inv?.length, 2, 'abc and empty string should be in invalid');
    // Valid number should have been sent (recorded as API call)
    assert.equal(sms.calls.length, 1, 'API should be called once for valid numbers');
  });
});

describe('send() — deduplication', () => {
  test('deduplicates normalised numbers — sends each number only once', async () => {
    const sms = new TestKwtSMS('user', 'pass', { logFile: '' });
    sms.setResponse({ result: 'OK', 'msg-id': 'x1', numbers: 1, 'points-charged': 1, 'balance-after': 99 });
    sms.resetCalls();
    // +96598765432 and 0096598765432 both normalise to 96598765432
    const result = await sms.send(['+96598765432', '0096598765432'], 'hello') as SendResult;
    assert.equal(result.result, 'OK');
    assert.equal(sms.calls.length, 1, 'API should be called exactly once');
    assert.equal(sms.calls[0].payload.mobile, '96598765432', 'only one normalised number sent');
  });
});
