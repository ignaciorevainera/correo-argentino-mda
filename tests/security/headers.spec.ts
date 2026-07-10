import 'dotenv/config';
import { test, expect } from '@playwright/test';

const EXPECTED_HEADERS = [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['strict-transport-security', 'max-age=63072000; includeSubDomains; preload'],
];

const EXPECTED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
];

test.describe('S1.3 Security headers', () => {
  for (const path of ['/', '/login']) {
    test(`${path}: security headers present`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);

      for (const [header, value] of EXPECTED_HEADERS) {
        expect(response.headers()[header]).toBe(value);
      }

      const csp = response.headers()['content-security-policy'];
      expect(csp).toBeDefined();
      for (const directive of EXPECTED_CSP_DIRECTIVES) {
        expect(csp).toContain(directive);
      }
    });
  }
});
