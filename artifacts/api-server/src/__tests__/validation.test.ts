import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  updateUserSchema,
  createCompanySchema,
  loginSchema,
  validate,
} from '../lib/schemas';

describe('User Schema Validation', () => {
  it('يجب أن يقبل بيانات مستخدم صحيحة', () => {
    const result = validate(createUserSchema, {
      name:     'محمد أحمد',
      username: 'mohammed',
      pin:      '12345678',
      role:     'cashier',
    });
    expect(result.success).toBe(true);
  });

  it('يجب أن يرفض اسم أقل من حرفين', () => {
    const result = validate(createUserSchema, {
      name:     'م',
      username: 'mohammed',
      pin:      '1234',
      role:     'cashier',
    });
    expect(result.success).toBe(false);
    expect(result.success === false && result.errors).toBeDefined();
  });

  it('يجب أن يرفض username بمسافات', () => {
    const result = validate(createUserSchema, {
      name:     'محمد أحمد',
      username: 'mohammed ali',
      pin:      '1234',
      role:     'cashier',
    });
    expect(result.success).toBe(false);
  });

  it('يجب أن يرفض PIN أقل من 4 أحرف', () => {
    const result = validate(createUserSchema, {
      name:     'محمد',
      username: 'mohammed',
      pin:      '123',
      role:     'cashier',
    });
    expect(result.success).toBe(false);
  });

  it('يجب أن يرفض role غير صالح', () => {
    const result = validate(createUserSchema, {
      name:     'محمد',
      username: 'mohammed',
      pin:      '1234',
      role:     'super_admin',
    });
    expect(result.success).toBe(false);
  });

  it('يجب أن يقبل update بدون pin', () => {
    const result = validate(updateUserSchema, {
      name: 'محمد الجديد',
    });
    expect(result.success).toBe(true);
  });
});

describe('Company Schema Validation', () => {
  it('يجب أن يقبل بيانات شركة صحيحة', () => {
    const result = validate(createCompanySchema, {
      name:          'شركة الاختبار',
      plan_type:     'trial',
      duration_days: 7,
    });
    expect(result.success).toBe(true);
  });

  it('يجب أن يرفض plan_type غير صالح', () => {
    const result = validate(createCompanySchema, {
      name:          'شركة',
      plan_type:     'invalid_plan',
      duration_days: 7,
    });
    expect(result.success).toBe(false);
  });

  it('يجب أن يرفض duration_days = 0', () => {
    const result = validate(createCompanySchema, {
      name:          'شركة',
      plan_type:     'trial',
      duration_days: 0,
    });
    expect(result.success).toBe(false);
  });

  it('يجب أن يرفض email غير صالح', () => {
    const result = validate(createCompanySchema, {
      name:          'شركة',
      plan_type:     'trial',
      duration_days: 7,
      admin_email:   'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('Login Schema Validation', () => {
  it('يجب أن يقبل بيانات login صحيحة', () => {
    const result = validate(loginSchema, { userId: 1, pin: '1234' });
    expect(result.success).toBe(true);
  });

  it('يجب أن يرفض userId = 0', () => {
    const result = validate(loginSchema, { userId: 0, pin: '1234' });
    expect(result.success).toBe(false);
  });

  it('يجب أن يرفض userId سلبي', () => {
    const result = validate(loginSchema, { userId: -1, pin: '1234' });
    expect(result.success).toBe(false);
  });

  it('يجب أن يرفض pin فارغ', () => {
    const result = validate(loginSchema, { userId: 1, pin: '' });
    expect(result.success).toBe(false);
  });
});
