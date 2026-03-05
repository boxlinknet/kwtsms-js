/**
 * In-memory OTP store adapter.
 *
 * Zero dependencies. Perfect for:
 *   - Development and testing
 *   - Single-process servers (no multi-instance coordination needed)
 *   - Serverless functions (each invocation is isolated anyway)
 *
 * Limitations:
 *   - Data lost on server restart
 *   - Not shared across multiple server instances
 *   → Use SQLite/Drizzle/Prisma adapter for production multi-instance deployments
 *
 * Usage:
 *   import { createMemoryStore } from './adapters/memory.js';
 *   const store = createMemoryStore();
 */

import type { OtpStore, OtpRecord } from '../otp-service.js';

export function createMemoryStore(): OtpStore {
  const records = new Map<string, OtpRecord>();
  const rateLimits = new Map<string, number[]>();

  return {
    async get(phone) {
      return records.get(phone) ?? null;
    },

    async set(phone, record) {
      records.set(phone, record);
    },

    async delete(phone) {
      records.delete(phone);
    },

    async getRateLimit(key) {
      return rateLimits.get(key) ?? [];
    },

    async setRateLimit(key, timestamps) {
      rateLimits.set(key, timestamps);
    },
  };
}
