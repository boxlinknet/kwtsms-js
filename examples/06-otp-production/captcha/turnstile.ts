/**
 * Cloudflare Turnstile CAPTCHA verifier.
 *
 * Privacy-friendly, free, unlimited verifications.
 * Works great alongside kwtSMS for Kuwait/GCC markets.
 *
 * Setup (5 minutes):
 *   1. Go to: https://dash.cloudflare.com → Zero Trust → Turnstile
 *   2. Click "Add site"
 *   3. Enter your site name and domain
 *   4. Copy the Site Key (for your frontend) and Secret Key (for this file)
 *   5. Set environment variable: TURNSTILE_SECRET=your_secret_key
 *
 * Frontend (add to your HTML):
 *   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
 *   <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
 *
 *   When the user submits your form, read the token:
 *   const token = document.querySelector('[name="cf-turnstile-response"]').value;
 *   // Send token to your backend in the request body as captchaToken
 *
 * Backend:
 *   import { createTurnstileVerifier } from './captcha/turnstile.js';
 *   const captcha = createTurnstileVerifier(process.env.TURNSTILE_SECRET!);
 *   // Pass to createOtpService({ ..., captcha })
 *
 * Environment variable:
 *   TURNSTILE_SECRET=your_secret_key_here
 */

import https from 'node:https';
import type { CaptchaVerifier } from '../otp-service.js';

export function createTurnstileVerifier(secret: string): CaptchaVerifier {
  return {
    async verify(token: string, ip?: string): Promise<boolean> {
      if (!token) return false;

      const body = JSON.stringify({
        secret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      });

      return new Promise((resolve) => {
        const req = https.request(
          {
            hostname: 'challenges.cloudflare.com',
            path: '/turnstile/v0/siteverify',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              try {
                const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { success: boolean };
                resolve(data.success === true);
              } catch {
                resolve(false);
              }
            });
          },
        );

        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => { req.destroy(); resolve(false); });
        req.write(body);
        req.end();
      });
    },
  };
}
