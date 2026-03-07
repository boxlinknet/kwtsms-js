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
  /** Number of batches sent (each batch is up to 200 numbers). */
  batches: number;
  /** Total number of recipients across all successful batches. */
  numbers: number;
  /** Total SMS credits consumed across all successful batches. */
  'points-charged': number;
  /** Available balance after the last successful batch, or null if all batches failed. */
  'balance-after': number | null;
  /** Message IDs for each successful batch. */
  'msg-ids': string[];
  /** Per-batch error details for failed batches. */
  errors: Array<{ batch: number; code: string; description: string }>;
  /** Numbers that failed local pre-validation (never sent to API). */
  invalid?: InvalidEntry[];
  /** Error code from first failed batch — mirrors SendResult shape for uniform error handling. */
  code?: string;
  /** Error description from first failed batch — mirrors SendResult shape for uniform error handling. */
  description?: string;
}

export interface ValidateResult {
  /** Numbers validated OK by the API. Normalised format (digits only, no prefix). */
  ok: string[];
  /**
   * Invalid numbers. Mixed format:
   * - Numbers rejected by the API appear in normalised format (digits only).
   * - Numbers rejected by local pre-validation appear as the original input string.
   * Use `rejected` for structured details on locally-rejected entries.
   */
  er: string[];
  /** Numbers with no route. Normalised format. */
  nr: string[];
  /** Raw API response, or null if the API was not called. */
  raw: ApiResponse | null;
  /** Error message if the API call failed, or null on success. */
  error: string | null;
  /** Details for numbers rejected by local validation before the API call. */
  rejected: InvalidEntry[];
}

// ── KwtSMS class ──────────────────────────────────────────────────────────────

export class KwtSMS {
  readonly username: string;
  #password: string;
  readonly senderId: string;
  readonly testMode: boolean;
  readonly logFile: string;

  /** Cached balance from last verify() / send() call. */
  protected _cachedBalance: number | null = null;
  protected _cachedPurchased: number | null = null;

  /** Available balance from the last verify() or send() call. */
  get cachedBalance(): number | null { return this._cachedBalance; }

  /** Purchased credits from the last verify() call. */
  get cachedPurchased(): number | null { return this._cachedPurchased; }

  /**
   * Create a KwtSMS client.
   *
   * @param username  API username (NOT your account mobile number)
   * @param password  API password (stored as a private field, never serialised)
   * @param options   senderId, testMode, logFile
   *
   * IMPORTANT — Logging and privacy:
   * When logFile is set (default: 'kwtsms.log'), every API call is recorded to disk
   * in JSONL format. Log entries include the full request payload: mobile numbers
   * and message text (including OTP codes). Passwords are always masked as "***".
   *
   * For OTP use cases or any scenario where message bodies are sensitive, either:
   *   - Set logFile: '' to disable logging entirely, or
   *   - Ensure your log file has appropriate access controls (chmod 600)
   */
  constructor(username: string, password: string, options: KwtSMSOptions = {}) {
    if (!username || !password) {
      throw new Error('username and password are required');
    }
    this.username = username;
    this.#password = password;
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
    return { username: this.username, password: this.#password };
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
   * Get current balance via a /balance/ API call (calls verify() internally).
   *
   * Returns the live balance on success.
   * If the API call fails and a cached value exists from a previous verify() or send(),
   * returns the cached value (which may be stale). Returns null if no cached value exists.
   *
   * To distinguish live vs stale: call verify() directly — it returns [ok, balance, error].
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

  // ── status ───────────────────────────────────────────────────────────────

  /**
   * Get delivery status for a sent message via /report/.
   * Never throws. Returns enriched error dict on failure.
   *
   * Common error codes:
   *   ERR019: No delivery reports found
   *   ERR020: Message ID does not exist
   *   ERR021: Report not ready yet
   *   ERR030: Message stuck in queue with error (normal for test mode)
   */
  async status(msgId: string): Promise<ApiResponse> {
    try {
      const data = await apiRequest('status', { ...this._creds, msgid: msgId }, this.logFile);
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

    // Deduplicate normalised numbers (e.g. '+96598765432' and '0096598765432' both → '96598765432')
    const uniqueValid = [...new Set(validNumbers)];

    // All numbers failed local validation — return error, never crash
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

    // Pre-flight: clean message and reject if empty (e.g. emoji-only input)
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

    let result: SendResult | BulkSendResult;

    if (uniqueValid.length > BATCH_SIZE) {
      result = await this._sendBulk(uniqueValid, cleaned, effectiveSender);
    } else {
      const payload = {
        ...this._creds,
        sender: effectiveSender,
        mobile: uniqueValid.join(','),
        message: cleaned,
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
      (result as SendResult | BulkSendResult).invalid = invalid;
    }

    return result;
  }

  // ── _sendBulk (internal) ──────────────────────────────────────────────────

  private async _sendBulk(
    numbers: string[],
    message: string,
    sender: string,
  ): Promise<BulkSendResult> {
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
        message,
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
      } else if (data !== null) {
        // Unexpected result value — record as error so the batch is not silently dropped
        errors.push({
          batch: i + 1,
          code: 'UNKNOWN',
          description: `Unexpected API result: ${String(data?.result ?? 'null')}`,
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

    const bulkResult: BulkSendResult = {
      result: overall,
      bulk: true,
      batches: batches.length,
      numbers: totalNums,
      'points-charged': totalPts,
      'balance-after': lastBalance,
      'msg-ids': msgIds,
      errors,
    };

    if (errors.length > 0) {
      bulkResult.code = errors[0].code;
      bulkResult.description = errors[0].description;
    }

    return bulkResult;
  }
}
