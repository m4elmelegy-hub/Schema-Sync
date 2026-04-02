/**
 * period-lock.ts — قفل الفترة المحاسبية
 *
 * إذا كان closing_date مُعيَّناً في system_settings، يُمنع أيّ تعديل أو حذف أو
 * إلغاء لأيّ مستند تاريخه ≤ closing_date.
 *
 * الاستخدام:
 *   await assertPeriodOpen(docDate, req);
 *
 * الاستثناء (أدمن فقط):
 *   أرسل { admin_override: true } في body مع مستخدم دوره "admin".
 */

import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";
import { httpError } from "./async-handler";
import type { Request } from "express";

const CACHE_TTL_MS = 5_000; // إعادة القراءة من DB كل 5 ثواني كحد أقصى
let cachedDate: string | null | undefined = undefined;
let cacheExpiry = 0;

/**
 * يُعيد تاريخ الإغلاق الحالي (YYYY-MM-DD) أو null إذا لم يُعيَّن.
 * يستخدم ذاكرة مؤقتة قصيرة لتجنب قراءة DB عند كل طلب.
 */
export async function getClosingDate(): Promise<string | null> {
  const now = Date.now();
  if (cachedDate !== undefined && now < cacheExpiry) return cachedDate;

  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "closing_date"));

  cachedDate = row?.value ?? null;
  cacheExpiry = now + CACHE_TTL_MS;
  return cachedDate ?? null;
}

/**
 * ضع هذا الاستدعاء في أي مُعالج كتابة قبل أيّ منطق عمل.
 *
 * @param docDate  تاريخ المستند (YYYY-MM-DD) أو null/undefined (يُستخدم تاريخ اليوم)
 * @param req      كائن الطلب (يُستخدم للتحقق من دور الأدمن)
 * @throws 423 Locked إذا كانت الفترة مقفلة وليس هناك تجاوز مسموح
 */
export async function assertPeriodOpen(
  docDate: string | null | undefined,
  req: Request,
): Promise<void> {
  const closingDate = await getClosingDate();
  if (!closingDate) return; // لا قفل مُفعَّل

  const date = (docDate ?? new Date().toISOString().split("T")[0]).slice(0, 10);
  if (date > closingDate) return; // التاريخ بعد فترة الإغلاق — مسموح

  // التاريخ ضمن الفترة المقفلة
  // السماح للأدمن بالتجاوز إذا أرسل admin_override: true
  const isAdmin   = req.user?.role === "admin";
  const overrideRequested = req.body?.admin_override === true;
  if (isAdmin && overrideRequested) return;

  const adminHint = isAdmin
    ? " — أرسل admin_override: true للتجاوز"
    : "";
  throw httpError(423, `هذه الفترة مقفلة (تاريخ الإغلاق: ${closingDate})${adminHint}`);
}

/** مسح الذاكرة المؤقتة (يُستدعى عند تغيير الإعداد) */
export function invalidateClosingDateCache(): void {
  cachedDate = undefined;
  cacheExpiry = 0;
}
