/**
 * KwtSMS API client.
 *
 * Zero external dependencies. Node.js 16+.
 *
 * Server timezone: Asia/Kuwait (GMT+3).
 * unix-timestamp values in API responses are GMT+3 server time, not UTC.
 * Log timestamps written by this client are always UTC ISO-8601.
 *
 * Quick start:
 *   const sms = KwtSMS.fromEnv();
 *   const [ok, balance, err] = await sms.verify();
 *   const result = await sms.send('96598765432', 'Your OTP for MYAPP is: 123456');
 */

import { validatePhoneInput } from './phone.js';
import { cleanMessage } from './message.js';
import { enrichError, type ApiResponse } from './errors.js';
import { apiRequest } from './request.js';
import { loadEnvFile } from './env.js';

const BATCH_SIZE = 200;
const BATCH_DELAY_MS = 500;                          // 0.5 s → max 2 req/s
const ERR013_WAITS_MS = [30_000, 60_000, 120_000];  // retry backoff for queue-full

// ── Public types ──────────────────────────────────────────────────────────────

export interface KwtSMSOptions {
  senderId?: string;
  testMode?: boolean;
  logFile?: string;
}

export interface InvalidEntry {
  input: string;
  error: string;
}

export interface SendResult extends ApiResponse {
  invalid?: InvalidEntry[];
}

export interface BulkSendResult {
  result: 'OK' | 'PARTIAL' | 'ERROR';
  bulk: true;
  batches: number;
  numbers: number;
  'points-charged': number;
  'balance-after': number | null;
  'msg-ids': string[];
  errors: Array<{ batch: number; code: string; description: string }>;
  invalid?: InvalidEntry[];
}

export interface ValidateResult {
  ok: string[];
  er: string[];
  nr: string[];
  raw: ApiResponse | null;
  error: string | null;
  rejected: InvalidEntry[];
}

// ── KwtSMS class ──────────────────────────────────────────────────────────────

export class KwtSMS {
  readonly username: string;
  readonly password: string;
  readonly senderId: string;
  readonly testMode: boolean;
  readonly logFile: string;

  /** Cached balance from last verify() / send() call. */
  _cachedBalance: number | null = null;
  _cachedPurchased: number | null = null;

  /**
   * Create a KwtSMS client.
   *
   * @param username  API username (NOT your account mobile number)
   * @param password  API password
   * @param options   senderId, testMode, logFile
   */
  constructor(username: string, password: string, options: KwtSMSOptions = {}) {
    if (!username || !password) {
      throw new Error('username and password are required');
    }
    this.username = username;
    this.password = password;
    this.senderId = options.senderId ?? 'KWT-SMS';
    this.testMode = options.testMode ?? false;
    this.logFile = options.logFile ?? 'kwtsms.log';
  }

  /**
   * Load credentials from environment variables, falling back to .env file.
   *
   * Required: KWTSMS_USERNAME, KWTSMS_PASSWORD
   * Optional: KWTSMS_SENDER_ID, KWTSMS_TEST_MODE, KWTSMS_LOG_FILE
   */
  static fromEnv(envFile = '.env'): KwtSMS {
    const fileEnv = loadEnvFile(envFile);
    const get = (key: string, fallback = ''): string =>
      process.env[key] ?? fileEnv[key] ?? fallback;

    const username = get('KWTSMS_USERNAME');
    const password = get('KWTSMS_PASSWORD');

    const missing = (
      [['KWTSMS_USERNAME', username], ['KWTSMS_PASSWORD', password]] as [string, string][]
    ).filter(([, v]) => !v).map(([k]) => k);

    if (missing.length > 0) {
      throw new Error(`Missing credentials: ${missing.join(', ')}`);
    }

    return new KwtSMS(username, password, {
      senderId: get('KWTSMS_SENDER_ID', 'KWT-SMS'),
      testMode: get('KWTSMS_TEST_MODE', '0') === '1',
      logFile: get('KWTSMS_LOG_FILE', 'kwtsms.log'),
    });
  }

  private get _creds(): Record<string, string> {
    return { username: this.username, password: this.password };
  }

  // ── verify ────────────────────────────────────────────────────────────────

  /**
   * Test credentials by calling /balance/.
   * Returns [ok, balance | null, error | null]. Never throws.
   */
  async verify(): Promise<[boolean, number | null, string | null]> {
    try {
      const data = await apiRequest('balance', this._creds, this.logFile);
      if (data.result === 'OK') {
        this._cachedBalance = Number(data['available'] ?? 0);
        this._cachedPurchased = Number(data['purchased'] ?? 0);
        return [true, this._cachedBalance, null];
      }
      const enriched = enrichError(data);
      const desc = String(enriched.description ?? enriched.code ?? 'Unknown error');
      const error = enriched.action ? `${desc} → ${enriched.action}` : desc;
      return [false, null, error];
    } catch (e) {
      return [false, null, (e as Error).message];
    }
  }

  // ── balance ───────────────────────────────────────────────────────────────

  /**
   * Get current balance via /balance/ API call.
   * Returns cached value if API call fails and a cached value exists.
   */
  async balance(): Promise<number | null> {
    const [ok, bal] = await this.verify();
    return ok ? bal : this._cachedBalance;
  }

  // ── senderids ─────────────────────────────────────────────────────────────

  /**
   * List sender IDs on this account via /senderid/.
   * Never throws. Returns error dict on failure.
   */
  async senderids(): Promise<ApiResponse & { senderids?: string[] }> {
    try {
      const data = await apiRequest('senderid', this._creds, this.logFile);
      if (data.result === 'OK') {
        return { result: 'OK', senderids: (data['senderid'] as string[]) ?? [] };
      }
      return enrichError(data);
    } catch (e) {
      return {
        result: 'ERROR',
        code: 'NETWORK',
        description: (e as Error).message,
        action: 'Check your internet connection and try again.',
      };
    }
  }

  // ── coverage ──────────────────────────────────────────────────────────────

  /**
   * List active country coverage prefixes via /coverage/.
   * Never throws. Returns error dict on failure.
   */
  async coverage(): Promise<ApiResponse> {
    try {
      const data = await apiRequest('coverage', this._creds, this.logFile);
      return enrichError(data);
    } catch (e) {
      return { result: 'ERROR', code: 'NETWORK', description: (e as Error).message };
    }
  }

  // ── validate ──────────────────────────────────────────────────────────────

  /**
   * Validate phone numbers via /validate/.
   * Runs local validation first; sends only locally-valid numbers to the API.
   * Never throws.
   */
  async validate(phones: string[]): Promise<ValidateResult> {
    const validNormalized: string[] = [];
    const preRejected: InvalidEntry[] = [];

    for (const raw of phones) {
      const [isValid, error, normalized] = validatePhoneInput(String(raw));
      if (isValid) {
        validNormalized.push(normalized);
      } else {
        preRejected.push({ input: String(raw), error: error! });
      }
    }

    const result: ValidateResult = {
      ok: [],
      er: preRejected.map((r) => r.input),
      nr: [],
      raw: null,
      error: null,
      rejected: preRejected,
    };

    if (validNormalized.length === 0) {
      result.error =
        preRejected.length === 1
          ? preRejected[0].error
          : `All ${preRejected.length} phone numbers failed validation`;
      return result;
    }

    const payload = { ...this._creds, mobile: validNormalized.join(',') };
    try {
      const data = await apiRequest('validate', payload, this.logFile);
      if (data.result === 'OK') {
        const mobile = (data['mobile'] as Record<string, string[]>) ?? {};
        result.ok = mobile['OK'] ?? [];
        result.er = [...(mobile['ER'] ?? []), ...result.er];
        result.nr = mobile['NR'] ?? [];
        result.raw = data;
      } else {
        const enriched = enrichError(data);
        result.er = [...validNormalized, ...result.er];
        result.raw = enriched;
        result.error = String(enriched.description ?? enriched.code ?? 'Unknown error');
        if (enriched.action) result.error = `${result.error} → ${enriched.action}`;
      }
    } catch (e) {
      result.er = [...validNormalized, ...result.er];
      result.error = (e as Error).message;
    }

    return result;
  }

  // ── send ──────────────────────────────────────────────────────────────────

  /**
   * Send SMS to one or more phone numbers.
   *
   * Normalizes numbers and cleans the message automatically.
   * For >200 numbers, splits into batches of 200 automatically.
   * Never throws.
   *
   * @param mobile  Single number, array of numbers, or comma-separated string
   * @param message SMS text (cleaned automatically)
   * @param sender  Optional sender ID override for this call only
   */
  async send(
    mobile: string | string[],
    message: string,
    sender?: string,
  ): Promise<SendResult | BulkSendResult> {
    const effectiveSender = sender ?? this.senderId;
    const rawList = Array.isArray(mobile) ? mobile : [mobile];

    // Validate all inputs locally first
    const validNumbers: string[] = [];
    const invalid: InvalidEntry[] = [];

    for (const raw of rawList) {
      const [isValid, error, normalized] = validatePhoneInput(String(raw));
      if (isValid) {
        validNumbers.push(normalized);
      } else {
        invalid.push({ input: String(raw), error: error! });
      }
    }

    // All numbers failed local validation — return error, never crash
    if (validNumbers.length === 0) {
      const desc =
        invalid.length === 1
          ? invalid[0].error
          : `All ${invalid.length} phone numbers are invalid`;
      return {
        ...enrichError({ result: 'ERROR', code: 'ERR_INVALID_INPUT', description: desc }),
        invalid,
      } as SendResult;
    }

    let result: SendResult | BulkSendResult;

    if (validNumbers.length > BATCH_SIZE) {
      result = await this._sendBulk(validNumbers, message, effectiveSender);
    } else {
      const payload = {
        ...this._creds,
        sender: effectiveSender,
        mobile: validNumbers.join(','),
        message: cleanMessage(message),
        test: this.testMode ? '1' : '0',
      };
      try {
        const data = await apiRequest('send', payload, this.logFile);
        if (data.result === 'OK') {
          if (data['balance-after'] !== undefined) {
            this._cachedBalance = Number(data['balance-after']);
          }
          result = data as SendResult;
        } else {
          result = enrichError(data) as SendResult;
        }
      } catch (e) {
        result = {
          result: 'ERROR',
          code: 'NETWORK',
          description: (e as Error).message,
          action: 'Check your internet connection and try again.',
        } as SendResult;
      }
    }

    if (invalid.length > 0) {
      (result as SendResult).invalid = invalid;
    }

    return result;
  }

  // ── _sendBulk (internal) ──────────────────────────────────────────────────

  private async _sendBulk(
    numbers: string[],
    message: string,
    sender: string,
  ): Promise<BulkSendResult> {
    const cleanedMsg = cleanMessage(message);
    const batches: string[][] = [];
    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
      batches.push(numbers.slice(i, i + BATCH_SIZE));
    }

    const msgIds: string[] = [];
    const errors: BulkSendResult['errors'] = [];
    let totalNums = 0;
    let totalPts = 0;
    let lastBalance: number | null = null;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const payload = {
        ...this._creds,
        sender,
        mobile: batch.join(','),
        message: cleanedMsg,
        test: this.testMode ? '1' : '0',
      };

      let data: ApiResponse | null = null;

      // Try once, then retry on ERR013 (queue full) with backoff
      for (let attempt = 0; attempt <= ERR013_WAITS_MS.length; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((r) => setTimeout(r, ERR013_WAITS_MS[attempt - 1]));
        }
        try {
          data = await apiRequest('send', payload, this.logFile);
        } catch (e) {
          errors.push({
            batch: i + 1,
            code: 'NETWORK',
            description: (e as Error).message,
          });
          data = null;
          break;
        }
        if (data.code !== 'ERR013') break;
      }

      if (data?.result === 'OK') {
        msgIds.push(String(data['msg-id'] ?? ''));
        totalNums += Number(data['numbers'] ?? batch.length);
        totalPts += Number(data['points-charged'] ?? 0);
        if (data['balance-after'] !== undefined) {
          lastBalance = Number(data['balance-after']);
          this._cachedBalance = lastBalance;
        }
      } else if (data?.result === 'ERROR') {
        errors.push({
          batch: i + 1,
          code: String(data.code ?? 'UNKNOWN'),
          description: String(data.description ?? 'Unknown error'),
        });
      }

      // Delay between batches (not after last batch)
      if (i < batches.length - 1) {
        await new Promise<void>((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const okCount = msgIds.length;
    const overall: 'OK' | 'PARTIAL' | 'ERROR' =
      okCount === batches.length ? 'OK' : okCount === 0 ? 'ERROR' : 'PARTIAL';

    return {
      result: overall,
      bulk: true,
      batches: batches.length,
      numbers: totalNums,
      'points-charged': totalPts,
      'balance-after': lastBalance,
      'msg-ids': msgIds,
      errors,
    };
  }
}
