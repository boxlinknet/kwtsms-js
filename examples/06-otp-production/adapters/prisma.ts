/**
 * Prisma OTP store adapter.
 *
 * Works with any database Prisma supports (PostgreSQL, MySQL, SQLite,
 * MongoDB, CockroachDB, etc.). You pass in your configured PrismaClient.
 *
 * Best for:
 *   - Projects already using Prisma
 *   - Multi-instance deployments (shared DB)
 *   - Teams that prefer Prisma's generated type safety
 *
 * Install:
 *   npm install @prisma/client
 *   npm install --save-dev prisma
 *   npx prisma init
 *
 * Add to your schema.prisma:
 * ─────────────────────────────────────────────────────────────────────────────
 * model OtpRecord {
 *   phone           String   @id
 *   code            String
 *   expiresAt       Int
 *   resendAllowedAt Int
 *   attempts        Int      @default(0)
 *   used            Boolean  @default(false)
 *   createdAt       Int
 *   ipAddress       String?
 *
 *   @@map("otp_records")
 * }
 *
 * model OtpRateLimit {
 *   key       String @id
 *   timestamps String
 *   updatedAt Int
 *
 *   @@map("otp_rate_limits")
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Then run:
 *   npx prisma migrate dev --name add_otp_tables
 *
 * Usage:
 *   import { PrismaClient } from '@prisma/client';
 *   import { createPrismaStore } from './adapters/prisma.js';
 *
 *   const prisma = new PrismaClient();
 *   const store = createPrismaStore({ prisma });
 */

import type { OtpStore } from '../otp-service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPrismaStore(options: { prisma: any }): OtpStore {
  const { prisma } = options;

  return {
    async get(phone) {
      const row = await prisma.otpRecord.findUnique({ where: { phone } });
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
      const data = {
        code: record.code,
        expiresAt: record.expiresAt,
        resendAllowedAt: record.resendAllowedAt,
        attempts: record.attempts,
        used: record.used,
        createdAt: record.createdAt,
        ipAddress: record.ipAddress ?? null,
      };
      await prisma.otpRecord.upsert({
        where: { phone },
        create: { phone, ...data },
        update: data,
      });
    },

    async delete(phone) {
      // Ignore "record not found" errors on delete
      await prisma.otpRecord.delete({ where: { phone } }).catch(() => {});
    },

    async getRateLimit(key) {
      const row = await prisma.otpRateLimit.findUnique({ where: { key } });
      if (!row) return [];
      return JSON.parse(row.timestamps) as number[];
    },

    async setRateLimit(key, timestamps) {
      const data = { timestamps: JSON.stringify(timestamps), updatedAt: Date.now() };
      await prisma.otpRateLimit.upsert({
        where: { key },
        create: { key, ...data },
        update: data,
      });
    },
  };
}
