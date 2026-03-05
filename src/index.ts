/**
 * kwtsms — JavaScript/TypeScript client for the kwtSMS SMS API (kwtsms.com)
 *
 * @example
 * ```typescript
 * // TypeScript / ESM
 * import { KwtSMS } from 'kwtsms';
 * const sms = KwtSMS.fromEnv();
 * const result = await sms.send('96598765432', 'Your OTP for MYAPP is: 123456');
 * ```
 *
 * @example
 * ```javascript
 * // JavaScript / CommonJS
 * const { KwtSMS } = require('kwtsms');
 * const sms = KwtSMS.fromEnv();
 * ```
 */

// Main client
export { KwtSMS } from './client.js';

// Utility functions (useful for callers who want to validate/clean before calling send)
export { normalizePhone, validatePhoneInput } from './phone.js';
export { cleanMessage } from './message.js';
export { API_ERRORS, enrichError } from './errors.js';

// TypeScript types
export type {
  KwtSMSOptions,
  SendResult,
  BulkSendResult,
  ValidateResult,
  InvalidEntry,
} from './client.js';
export type { ApiResponse } from './errors.js';
