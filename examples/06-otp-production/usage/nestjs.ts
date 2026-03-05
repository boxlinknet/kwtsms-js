/**
 * OTP endpoints — NestJS
 *
 * NestJS uses decorators and dependency injection. This example shows
 * a controller + module that you drop into your NestJS project.
 *
 * Install in your NestJS project:
 *   npm install kwtsms bcryptjs
 *
 * Files to create in your NestJS project:
 *   src/auth/otp.service.ts     ← OTP service wrapper
 *   src/auth/auth.controller.ts ← this controller
 *   src/auth/auth.module.ts     ← module registration
 *
 * Environment variables (.env):
 *   KWTSMS_USERNAME=your_username
 *   KWTSMS_PASSWORD=your_password
 *   KWTSMS_SENDER_ID=YOUR-APP
 *   KWTSMS_LOG_FILE=
 */

import { Controller, Post, Body, Req, Res, Injectable, Module } from '@nestjs/common';
import type { Request, Response } from 'express';
import { KwtSMS } from '../../../src/index.js';
import { createOtpService, type OtpService } from '../otp-service.js';
import { createMemoryStore } from '../adapters/memory.js';
// import { createSQLiteStore }  from '../adapters/sqlite.js';
// import { createTurnstileVerifier } from '../captcha/turnstile.js';

// ── src/auth/otp.service.ts ───────────────────────────────────────────────────

@Injectable()
export class OtpNestService {
  private readonly service: OtpService;

  constructor() {
    const sms = KwtSMS.fromEnv();
    const store = createMemoryStore();
    // const store = createSQLiteStore({ filename: './otp.db' });

    this.service = createOtpService({
      sms,
      store,
      appName: 'MyApp',
      // captcha: createTurnstileVerifier(process.env.TURNSTILE_SECRET!),
    });
  }

  sendOtp(phone: unknown, captchaToken?: string, ip?: string) {
    return this.service.sendOtp(phone, captchaToken, ip);
  }

  verifyOtp(phone: unknown, code: unknown, ip?: string) {
    return this.service.verifyOtp(phone, code, ip);
  }
}

// ── src/auth/auth.controller.ts ───────────────────────────────────────────────

@Controller('auth')
export class AuthController {
  constructor(private readonly otpService: OtpNestService) {}

  @Post('send-otp')
  async sendOtp(
    @Body() body: { phone: unknown; captchaToken?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? '127.0.0.1';

    const result = await this.otpService.sendOtp(body.phone, body.captchaToken, ip);
    return res.status(result.success ? 200 : result.retryAfter ? 429 : 400).json(result);
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body() body: { phone: unknown; code: unknown },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? '127.0.0.1';

    const result = await this.otpService.verifyOtp(body.phone, body.code, ip);

    if (result.success) {
      // Issue JWT / set session here
      return res.json({ success: true });
    }
    return res.status(result.retryAfter ? 429 : 400).json(result);
  }
}

// ── src/auth/auth.module.ts ───────────────────────────────────────────────────

@Module({
  controllers: [AuthController],
  providers: [OtpNestService],
})
export class AuthModule {}

// Register AuthModule in your AppModule:
// @Module({ imports: [AuthModule] })
// export class AppModule {}
