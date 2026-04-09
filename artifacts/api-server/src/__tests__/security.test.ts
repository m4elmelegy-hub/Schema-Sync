import { describe, it, expect, vi } from 'vitest';
import { isTokenBlacklisted, blacklistToken } from '../lib/session-blacklist';
import { verifyTOTP, generateTOTPSecret } from '../lib/totp';
import speakeasy from 'speakeasy';

// Each test file that imports from app needs the DB mock
vi.mock('@workspace/db', () => ({
  db: {
    select:  vi.fn().mockReturnThis(),
    from:    vi.fn().mockReturnThis(),
    where:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockResolvedValue([]),
    insert:  vi.fn().mockReturnThis(),
    values:  vi.fn().mockResolvedValue([]),
    update:  vi.fn().mockReturnThis(),
    set:     vi.fn().mockReturnThis(),
    delete:  vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  },
  pool:             { end: vi.fn(), query: vi.fn() },
  erpUsersTable:    {},
  companiesTable:   {},
  salesTable:       {},
  productsTable:    {},
  customersTable:   {},
  safesTable:       {},
  warehousesTable:  {},
  auditLogsTable:   {},
}));

describe('Session Blacklist', () => {
  it('يجب أن يضيف token للـ blacklist', () => {
    const token = `test-token-${Date.now()}`;
    blacklistToken(token);
    expect(isTokenBlacklisted(token)).toBe(true);
  });

  it('يجب أن يقبل token غير موجود في الـ blacklist', () => {
    expect(isTokenBlacklisted('non-blacklisted-token-xyz')).toBe(false);
  });
});

describe('TOTP', () => {
  it('يجب أن ينشئ secret صالح', () => {
    const { secret, otpauth_url } = generateTOTPSecret('testuser');
    expect(secret).toBeDefined();
    expect(secret.length).toBeGreaterThan(10);
    expect(otpauth_url).toContain('testuser');
  });

  it('يجب أن يتحقق من TOTP code صحيح', () => {
    const generatedSecret = speakeasy.generateSecret({ length: 20 });
    const token = speakeasy.totp({ secret: generatedSecret.base32, encoding: 'base32' });
    const isValid = verifyTOTP(generatedSecret.base32, token);
    expect(isValid).toBe(true);
  });

  it('يجب أن يرفض TOTP code خاطئ', () => {
    const { secret } = generateTOTPSecret('testuser');
    const isValid = verifyTOTP(secret, '000000');
    expect(isValid).toBe(false);
  });
});

describe('Security Headers', () => {
  it('يجب أن يحتوي على X-Content-Type-Options', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app).get('/api/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('يجب أن يحتوي على X-Frame-Options', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app).get('/api/healthz');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('يجب أن لا يكشف X-Powered-By', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app).get('/api/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Rate Limiting', () => {
  it('يجب أن يحظر بعد تجاوز الـ rate limit', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const requests = Array(15).fill(null).map(() =>
      request(app).post('/api/auth/login').send({ userId: 1, pin: 'wrong' }),
    );
    const responses = await Promise.all(requests);
    const blockedResponses = responses.filter((r) => r.status === 429);
    expect(blockedResponses.length).toBeGreaterThan(0);
  });
});

describe('Input Sanitization', () => {
  it('يجب أن ينظف XSS في الـ body', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ userId: 1, pin: '<script>alert("xss")</script>' });
    expect(res.status).not.toBe(500);
  });
});
