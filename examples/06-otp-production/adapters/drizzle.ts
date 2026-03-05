/**
 * Drizzle ORM OTP store adapter.
 *
 * DB-agnostic adapter — works with any database Drizzle supports (SQLite,
 * PostgreSQL, MySQL, etc.). You pass in your configured Drizzle db instance.
 * NOTE: The schema below uses SQLite types. See the comments at the bottom
 * of the schema section for how to adapt for PostgreSQL or MySQL.
 *
 * Best for:
 *   - Projects already using Drizzle ORM
 *   - Multi-instance deployments (shared DB)
 *   - PostgreSQL/MySQL/SQLite with Drizzle
 *
 * Install (choose your driver):
 *   npm install drizzle-orm better-sqlite3       # SQLite
 *   npm install drizzle-orm postgres             # PostgreSQL
 *   npm install drizzle-orm mysql2               # MySQL
 *
 * Add these tables to your Drizzle schema file (schema.ts):
 *   export { otpRecords, otpRateLimits } from 'kwtsms/examples/06-otp-production/adapters/drizzle.js';
 *   OR copy the schema definitions below into your own schema file.
 *
 * Run migration after adding tables:
 *   npx drizzle-kit generate && npx drizzle-kit migrate
 *
 * Usage:
 *   import { createDrizzleStore } from './adapters/drizzle.js';
 *   const store = createDrizzleStore({ db });  // pass your drizzle db instance
 */

import { eq } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { OtpStore } from '../otp-service.js';

// ── Schema definitions ────────────────────────────────────────────────────────
// Export these so you can include them in your own schema.ts

export const otpRecords = sqliteTable('otp_records', {
  phone:           text('phone').primaryKey(),
  code:            text('code').notNull(),
  expiresAt:       integer('expires_at').notNull(),
  resendAllowedAt: integer('resend_allowed_at').notNull(),
  attempts:        integer('attempts').notNull().default(0),
  used:            integer('used', { mode: 'boolean' }).notNull().default(false),
  createdAt:       integer('created_at').notNull(),
  ipAddress:       text('ip_address'),
});

export const otpRateLimits = sqliteTable('otp_rate_limits', {
  key:        text('key').primaryKey(),
  timestamps: text('timestamps').notNull(),  // JSON array of unix ms
  updatedAt:  integer('updated_at').notNull(),
});

// For PostgreSQL, replace the imports above with:
//   import { integer, pgTable, text } from 'drizzle-orm/pg-core';
//   import { boolean } from 'drizzle-orm/pg-core';
// And change: used: boolean('used').notNull().default(false),

// ── Adapter factory ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDrizzleStore(options: { db: any }): OtpStore {
  const { db } = options;

  return {
    async get(phone) {
      const [row] = await db
        .select()
        .from(otpRecords)
        .where(eq(otpRecords.phone, phone));
      if (!row) return null;
      return {
        phone: row.phone,
        code: row.code,
        expiresAt: row.expiresAt,
        resendAllowedAt: row.resendAllowedAt,
        attempts: row.attempts,
        used: row.used,
        createdAt: row.createdAt,
        ipAddress: row.ipAddress ?? undefined,
      };
    },

    async set(phone, record) {
      await db
        .insert(otpRecords)
        .values({
          phone,
          code: record.code,
          expiresAt: record.expiresAt,
          resendAllowedAt: record.resendAllowedAt,
          attempts: record.attempts,
          used: record.used,
          createdAt: record.createdAt,
          ipAddress: record.ipAddress ?? null,
        })
        .onConflictDoUpdate({
          target: otpRecords.phone,
          set: {
            code: record.code,
            expiresAt: record.expiresAt,
            resendAllowedAt: record.resendAllowedAt,
            attempts: record.attempts,
            used: record.used,
            createdAt: record.createdAt,
            ipAddress: record.ipAddress ?? null,
          },
        });
    },

    async delete(phone) {
      await db.delete(otpRecords).where(eq(otpRecords.phone, phone));
    },

    async getRateLimit(key) {
      const [row] = await db
        .select()
        .from(otpRateLimits)
        .where(eq(otpRateLimits.key, key));
      if (!row) return [];
      return JSON.parse(row.timestamps) as number[];
    },

    async setRateLimit(key, timestamps) {
      await db
        .insert(otpRateLimits)
        .values({ key, timestamps: JSON.stringify(timestamps), updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: otpRateLimits.key,
          set: { timestamps: JSON.stringify(timestamps), updatedAt: Date.now() },
        });
    },
  };
}
