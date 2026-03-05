/**
 * kwtSMS API error codes and developer-friendly action messages.
 * Maps every error code the API can return to a "what to do next" message.
 */

export const API_ERRORS: Readonly<Record<string, string>> = {
  ERR001: 'API is disabled on this account. Enable it at kwtsms.com → Account → API.',
  ERR002: 'A required parameter is missing. Check that username, password, sender, mobile, and message are all provided.',
  ERR003: 'Wrong API username or password. Check KWTSMS_USERNAME and KWTSMS_PASSWORD. These are your API credentials, not your account mobile number.',
  ERR004: 'This account does not have API access. Contact kwtSMS support to enable it.',
  ERR005: 'This account is blocked. Contact kwtSMS support.',
  ERR006: 'No valid phone numbers. Make sure each number includes the country code (e.g., 96598765432 for Kuwait, not 98765432).',
  ERR007: 'Too many numbers in a single request (maximum 200). Split into smaller batches.',
  ERR008: 'This sender ID is banned or not found. Sender IDs are case sensitive ("Kuwait" is not the same as "KUWAIT"). Check your registered sender IDs at kwtsms.com.',
  ERR009: 'Message is empty. Provide a non-empty message text.',
  ERR010: 'Account balance is zero. Recharge credits at kwtsms.com.',
  ERR011: 'Insufficient balance for this send. Buy more credits at kwtsms.com.',
  ERR012: 'Message is too long (over 6 SMS pages). Shorten your message.',
  ERR013: 'Send queue is full (1000 messages). Wait a moment and try again.',
  ERR019: 'No delivery reports found for this message.',
  ERR020: 'Message ID does not exist. Make sure you saved the msg-id from the send response.',
  ERR021: 'No delivery report available for this message yet.',
  ERR022: 'Delivery reports are not ready yet. Try again after 24 hours.',
  ERR023: 'Unknown delivery report error. Contact kwtSMS support.',
  ERR024: 'Your IP address is not in the API whitelist. Add it at kwtsms.com → Account → API → IP Lockdown, or disable IP lockdown.',
  ERR025: 'Invalid phone number. Make sure the number includes the country code (e.g., 96598765432 for Kuwait, not 98765432).',
  ERR026: 'This country is not activated on your account. Contact kwtSMS support to enable the destination country.',
  ERR027: 'HTML tags are not allowed in the message. Remove any HTML content and try again.',
  ERR028: 'You must wait at least 15 seconds before sending to the same number again. No credits were consumed.',
  ERR029: 'Message ID does not exist or is incorrect.',
  ERR030: 'Message is stuck in the send queue with an error. Delete it at kwtsms.com → Queue to recover credits.',
  ERR031: 'Message rejected: bad language detected.',
  ERR032: 'Message rejected: spam detected.',
  ERR033: 'No active coverage found. Contact kwtSMS support.',
  ERR_INVALID_INPUT: 'One or more phone numbers are invalid. See details above.',
} as const;

export interface ApiResponse {
  result: string;
  code?: string;
  description?: string;
  action?: string;
  [key: string]: unknown;
}

/**
 * Add 'action' field to error responses with developer-friendly guidance.
 * Returns a new object. Never mutates the original.
 * Has no effect on OK responses or unknown error codes.
 */
export function enrichError(data: ApiResponse): ApiResponse {
  if (data.result !== 'ERROR') return data;
  const code = data.code ?? '';
  if (code in API_ERRORS) {
    return { ...data, action: API_ERRORS[code] };
  }
  return data;
}
