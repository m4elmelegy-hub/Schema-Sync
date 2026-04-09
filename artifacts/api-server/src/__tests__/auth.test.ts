import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth';

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

describe('Auth Middleware', () => {
  describe('signToken', () => {
    it('يجب أن ينشئ JWT صالح', () => {
      const token = signToken(1, 'company_admin', 1);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('يجب أن يحتوي على userId و role و companyId', () => {
      const token = signToken(42, 'cashier', 5);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      expect(decoded.userId).toBe(42);
      expect(decoded.role).toBe('cashier');
      expect(decoded.companyId).toBe(5);
    });

    it('يجب أن ينتهي بعد 4 ساعات', () => {
      const token = signToken(1, 'admin', 1);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBe(4 * 60 * 60);
    });
  });

  describe('signRefreshToken', () => {
    it('يجب أن ينشئ refresh token صالح', () => {
      const token = signRefreshToken(1);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('يجب أن يتحقق من refresh token صحيح', () => {
      const token = signRefreshToken(1);
      const result = verifyRefreshToken(token);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(1);
    });

    it('يجب أن يرفض refresh token منتهي أو غلط', () => {
      const result = verifyRefreshToken('invalid-token');
      expect(result).toBeNull();
    });
  });
});

describe('POST /api/auth/login', () => {
  it('يجب أن يرفض login بدون userId', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ pin: '123456' });
    expect(res.status).toBe(400);
  });

  it('يجب أن يرفض login بدون pin', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ userId: 1 });
    expect(res.status).toBe(400);
  });

  it('يجب أن يرجع 400 لـ userId غير صالح', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ userId: 'not-a-number', pin: '123456' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/healthz', () => {
  it('يجب أن يرجع status healthy', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('db');
    expect(res.body).toHaveProperty('memory_mb');
    expect(res.body).toHaveProperty('uptime_hours');
  });
});
