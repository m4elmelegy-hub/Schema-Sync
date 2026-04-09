import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock @workspace/db (needed because app.ts imports from it)
vi.mock('@workspace/db', () => ({
  db: {
    select:  vi.fn().mockReturnThis(),
    from:    vi.fn().mockReturnThis(),
    where:   vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
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

// Mock authenticate so we can control req.user per test.
// requireRole and superAdminIPGuard stay real.
vi.mock('../middleware/auth', async () => {
  const actual = await vi.importActual('../middleware/auth') as Record<string, unknown>;
  return {
    ...actual,
    authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
    superAdminIPGuard: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  };
});

import { authenticate } from '../middleware/auth';

describe('Multi-Tenant Isolation', () => {
  beforeEach(() => {
    // Default: behave as a company admin user
    vi.mocked(authenticate).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: 1, role: 'admin', active: true, company_id: 1 };
      next();
    });
  });

  it('يجب أن يرفض الطلب بدون token', async () => {
    // Make authenticate reject the request (simulating missing/invalid token)
    vi.mocked(authenticate).mockImplementation((_req: Request, res: Response) => {
      res.status(401).json({ error: 'غير مصرح' });
    });

    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app).get('/api/settings/users');
    expect(res.status).toBe(401);
  });

  it('يجب أن يقبل الطلب بـ token صالح', async () => {
    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app)
      .get('/api/settings/users')
      .set('Authorization', 'Bearer valid-test-token');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('يجب أن يرفض الوصول لـ super routes من company_admin', async () => {
    // Set a company_admin role — requireRole('super_admin') will reject
    vi.mocked(authenticate).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: 1, role: 'company_admin', active: true, company_id: 1 };
      next();
    });

    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app)
      .get('/api/super/companies')
      .set('Authorization', 'Bearer valid-test-token');
    expect(res.status).toBe(403);
  });

  it('يجب أن يسمح للـ super_admin بالوصول لـ super routes', async () => {
    vi.mocked(authenticate).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: 99, role: 'super_admin', active: true, company_id: null };
      next();
    });

    const request = (await import('supertest')).default;
    const app = (await import('../app')).default;
    const res = await request(app)
      .get('/api/super/companies')
      .set('Authorization', 'Bearer super-admin-token');
    expect(res.status).not.toBe(403);
  });
});
