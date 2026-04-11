/**
 * schemas.ts — Centralised Zod validation schemas for all write endpoints.
 * Import `validate()` and the relevant schema in each route file.
 */
import { z } from "zod";

/* ─── Shared primitives ──────────────────────────────────────────────────── */
const noSpaces = (field: string) =>
  z.string().regex(/^\S+$/, `${field} لا يجب أن يحتوي على مسافات`);

/* ─── Auth ───────────────────────────────────────────────────────────────── */
export const loginSchema = z.object({
  userId: z.number({ invalid_type_error: "userId يجب أن يكون رقماً" })
    .int().positive("userId يجب أن يكون رقماً موجباً").optional(),
  username: z.string().min(1).max(100).optional(),
  pin: z.string({ required_error: "الرقم السري مطلوب" })
    .min(1, "الرقم السري مطلوب")
    .max(50, "الرقم السري طويل جداً"),
  company_id: z.number().int().positive().optional(),
}).refine(
  (data) => data.userId !== undefined || (data.username !== undefined && data.username.trim().length > 0),
  { message: "userId أو username مطلوب" },
);

/* ─── Users ──────────────────────────────────────────────────────────────── */
const ALLOWED_ROLES = ["admin", "manager", "cashier", "salesperson"] as const;

export const createUserSchema = z.object({
  name: z.string({ required_error: "الاسم مطلوب" })
    .min(2, "الاسم يجب أن يكون حرفين على الأقل")
    .max(100, "الاسم طويل جداً"),
  username: noSpaces("اسم المستخدم")
    .min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
    .max(50, "اسم المستخدم طويل جداً"),
  pin: z.string({ required_error: "الرقم السري مطلوب" })
    .min(4, "الرقم السري يجب أن يكون 4 أحرف على الأقل")
    .max(50, "الرقم السري طويل جداً"),
  role: z.enum(ALLOWED_ROLES, {
    errorMap: () => ({ message: `الدور يجب أن يكون أحد: ${ALLOWED_ROLES.join(", ")}` }),
  }),
  email: z.string().email("بريد إلكتروني غير صحيح").optional().nullable(),
  warehouse_id: z.number().int().positive().optional().nullable(),
  safe_id: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional().default(true),
  permissions: z.string().optional(),
});

export const updateUserSchema = createUserSchema
  .omit({ pin: true })
  .extend({
    pin: z.string().min(4, "الرقم السري يجب أن يكون 4 أحرف على الأقل").max(50).optional(),
  })
  .partial();

/* ─── Companies (super admin) ────────────────────────────────────────────── */
export const createCompanySchema = z.object({
  name: z.string({ required_error: "اسم الشركة مطلوب" })
    .min(2, "اسم الشركة يجب أن يكون حرفين على الأقل")
    .max(200, "اسم الشركة طويل جداً"),
  plan_type: z.enum(["trial", "basic", "pro"], {
    errorMap: () => ({ message: "نوع الخطة يجب أن يكون: trial أو basic أو pro" }),
  }).default("trial"),
  duration_days: z.number()
    .int("عدد الأيام يجب أن يكون عدداً صحيحاً")
    .min(1, "يجب أن يكون يوم واحد على الأقل")
    .max(3650, "لا يمكن تجاوز 10 سنوات")
    .default(7),
  admin_email: z.string().email("بريد إلكتروني غير صحيح").optional().nullable(),
});

export const updateCompanySchema = createCompanySchema.partial();

/* ─── Safes ──────────────────────────────────────────────────────────────── */
export const createSafeSchema = z.object({
  name: z.string({ required_error: "اسم الخزينة مطلوب" })
    .min(1, "اسم الخزينة مطلوب")
    .max(100, "اسم الخزينة طويل جداً"),
  balance: z.number().min(0, "الرصيد لا يمكن أن يكون سالباً").optional().default(0),
  currency: z.string().max(10).optional(),
});

export const updateSafeSchema = createSafeSchema.partial();

/* ─── Warehouses ─────────────────────────────────────────────────────────── */
export const createWarehouseSchema = z.object({
  name: z.string({ required_error: "اسم المخزن مطلوب" })
    .min(1, "اسم المخزن مطلوب")
    .max(100, "اسم المخزن طويل جداً"),
  location: z.string().max(200).optional().nullable(),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

/* ─── Customers / Suppliers ──────────────────────────────────────────────── */
export const createCustomerSchema = z.object({
  name: z.string({ required_error: "الاسم مطلوب" })
    .min(1, "الاسم مطلوب")
    .max(200, "الاسم طويل جداً"),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email("بريد إلكتروني غير صحيح").optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  opening_balance: z.number().optional().default(0),
  is_supplier: z.boolean().optional().default(false),
});

export const updateCustomerSchema = createCustomerSchema.partial();

/* ─── Products ───────────────────────────────────────────────────────────── */
export const createProductSchema = z.object({
  name: z.string({ required_error: "اسم المنتج مطلوب" })
    .min(1, "اسم المنتج مطلوب")
    .max(200, "اسم المنتج طويل جداً"),
  sku: z.string().max(100).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  price: z.number({ required_error: "السعر مطلوب", invalid_type_error: "السعر يجب أن يكون رقماً" })
    .min(0, "السعر لا يمكن أن يكون سالباً"),
  cost_price: z.number().min(0).optional().default(0),
  category_id: z.number().int().positive().optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial();

/* ─── Validate helper ────────────────────────────────────────────────────── */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors = result.error.errors.map(
    (e) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message),
  );
  return { success: false, errors };
}
