/**
 * SQLite OTP store adapter (using better-sqlite3).
 *
 * Synchronous SQLite — embedded database, zero server required.
 * Creates the database file and tables automatically on first use.
 *
 * Best for:
 *   - Small to medium apps (tens of thousands of users)
 *   - Single-server deployments
 *   - Apps that want zero infrastructure overhead
 *
 * Install:
 *   npm install better-sqlite3
 *   npm install --save-dev @types/better-sqlite3
 *
 * Usage:
 *   import { createSQLiteStore } from './adapters/sqlite.js';
 *   const store = createSQLiteStore({ filename: './otp.db' });
 *
 * Database schema (created automatically):
 *   CREATE TABLE otp_records (...)
 *   CREATE TABLE otp_rate_limits (...)
 */

import Database from 'better-sqlite3';
import type { OtpStore, OtpRecord } from '../otp-service.js';

interface SQLiteStoreOptions {
  /** Path to the SQLite database file. Use ':memory:' for tests. */
  filename: string;
}

// Internal row type matching the DB schema
interface OtpRow {
  phone: string;
  code: string;
  expires_at: number;
  resend_allowed_at: number;
  attempts: number;
  used: number;         // SQLite stores booleans as 0/1
  created_at: number;
  ip_address: string | null;
}

interface RateLimitRow {
  timestamps: string;   // JSON array
}

export function createSQLiteStore(options: SQLiteStoreOptions): OtpStore {
  const db = new Database(options.filename);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create tables on first use
  db.exec(`
    CREATE TABLE IF NOT EXISTS otp_records (
      phone             TEXT PRIMARY KEY,
      code              TEXT NOT NULL,
      expires_at        INTEGER NOT NULL,
      resend_allowed_at INTEGER NOT NULL,
      attempts          INTEGER NOT NULL DEFAULT 0,
      used              INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL,
      ip_address        TEXT
    );

    CREATE TABLE IF NOT EXISTS otp_rate_limits (
      key               TEXT PRIMARY KEY,
      timestamps        TEXT NOT NULL,
      updated_at        INTEGER NOT NULL
    );
  `);

  // Prepare statements once (better-sqlite3 is synchronous — no await needed)
  const stmtGet = db.prepare<[string], OtpRow>('SELECT * FROM otp_records WHERE phone = ?');
  const stmtSet = db.prepare(
    `INSERT OR REPLACE INTO otp_records
       (phone, code, expires_at, resend_allowed_at, attempts, used, created_at, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const stmtDelete = db.prepare('DELETE FROM otp_records WHERE phone = ?');
  const stmtGetRate = db.prepare<[string], RateLimitRow>(
    'SELECT timestamps FROM otp_rate_limits WHERE key = ?',
  );
  const stmtSetRate = db.prepare(
    `INSERT OR REPLACE INTO otp_rate_limits (key, timestamps, updated_at) VALUES (?, ?, ?)`,
  );

  return {
    async get(phone) {
      const row = stmtGet.get(phone);
      if (!row) return null;
      return {
        phone: row.phone,
        code: row.code,
        expiresAt: row.expires_at,
        resendAllowedAt: row.resend_allowed_at,
        attempts: row.attempts,
        used: row.used === 1,
        createdAt: row.created_at,
        ipAddress: row.ip_address ?? undefined,
      };
    },

    async set(phone, record) {
      stmtSet.run(
        phone,
        record.code,
        record.expiresAt,
        record.resendAllowedAt,
        record.attempts,
        record.used ? 1 : 0,
        record.createdAt,
        record.ipAddress ?? null,
      );
    },

    async delete(phone) {
      stmtDelete.run(phone);
    },

    async getRateLimit(key) {
      const row = stmtGetRate.get(key);
      if (!row) return [];
      return JSON.parse(row.timestamps) as number[];
    },

    async setRateLimit(key, timestamps) {
      stmtSetRate.run(key, JSON.stringify(timestamps), Date.now());
    },
  };
}
