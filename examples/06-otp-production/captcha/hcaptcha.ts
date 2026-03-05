/**
 * hCaptcha CAPTCHA verifier.
 *
 * Privacy-focused alternative to reCAPTCHA. GDPR-safe.
 * Free tier: up to 1 million verifications/month.
 * Popular in MENA region and privacy-conscious applications.
 *
 * Setup (5 minutes):
 *   1. Go to: https://dashboard.hcaptcha.com/signup
 *   2. Create a new site
 *   3. Copy the Site Key (for your frontend) and Secret Key (for this file)
 *   4. Set environment variable: HCAPTCHA_SECRET=your_secret_key
 *
 * Frontend (add to your HTML):
 *   <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
 *   <div class="h-captcha" data-sitekey="YOUR_SITE_KEY"></div>
 *
 *   When the user submits your form, read the token:
 *   const token = document.querySelector('[name="h-captcha-response"]').value;
 *   // Send token to your backend in the request body as captchaToken
 *
 * Backend:
 *   import { createHCaptchaVerifier } from './captcha/hcaptcha.js';
 *   const captcha = createHCaptchaVerifier(process.env.HCAPTCHA_SECRET!);
 *   // Pass to createOtpService({ ..., captcha })
 *
 * Environment variable:
 *   HCAPTCHA_SECRET=your_secret_key_here
 */

import https from 'node:https';
import type { CaptchaVerifier } from '../otp-service.js';

export function createHCaptchaVerifier(secret: string): CaptchaVerifier {
  return {
    async verify(token: string, ip?: string): Promise<boolean> {
      if (!token) return false;

      const params = new URLSearchParams({ secret, response: token });
      if (ip) params.set('remoteip', ip);
      const body = params.toString();

      return new Promise((resolve) => {
        const req = https.request(
          {
            hostname: 'hcaptcha.com',
            path: '/siteverify',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
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
