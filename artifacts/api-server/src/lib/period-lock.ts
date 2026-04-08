/**
 * period-lock.ts — قفل الفترة المحاسبية (multi-tenant)
 *
 * إذا كان closing_date مُعيَّناً في system_settings للشركة، يُمنع أيّ تعديل أو حذف أو
 * إلغاء لأيّ مستند تاريخه ≤ closing_date.
 *
 * الاستخدام:
 *   await assertPeriodOpen(docDate, req);
 *
 * الاستثناء (أدمن فقط):
 *   أرسل { admin_override: true } في body مع مستخدم دوره "admin".
 */

import { and, eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";
import { httpError } from "./async-handler";
import { writeAuditLog } from "./audit-log";
import type { Request } from "express";

const CACHE_TTL_MS = 5_000; // إعادة القراءة من DB كل 5 ثواني كحد أقصى

/* Per-company cache: companyId → { date, expiry } */
const cache = new Map<number, { date: string | null; expiry: number }>();

/**
 * يُعيد تاريخ الإغلاق الحالي (YYYY-MM-DD) أو null إذا لم يُعيَّن.
 * يستخدم ذاكرة مؤقتة قصيرة لتجنب قراءة DB عند كل طلب.
 */
export async function getClosingDate(companyId: number = 1): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(companyId);
  if (cached && now < cached.expiry) return cached.date;

  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(
      and(
        eq(systemSettingsTable.key, "closing_date"),
        eq(systemSettingsTable.company_id, companyId),
      )
    );

  const date = row?.value ?? null;
  cache.set(companyId, { date, expiry: now + CACHE_TTL_MS });
  return date;
}

/**
 * ضع هذا الاستدعاء في أي مُعالج كتابة قبل أيّ منطق عمل.
 *
 * @param docDate  تاريخ المستند (YYYY-MM-DD) أو null/undefined (يُستخدم تاريخ اليوم)
 * @param req      كائن الطلب (يُستخدم للتحقق من دور الأدمن وcompany_id)
 * @throws 423 Locked إذا كانت الفترة مقفلة وليس هناك تجاوز مسموح
 */
export async function assertPeriodOpen(
  docDate: string | null | undefined,
  req: Request,
): Promise<void> {
  const companyId  = req.user?.company_id ?? 1;
  const closingDate = await getClosingDate(companyId);
  if (!closingDate) return; // لا قفل مُفعَّل

  const date = (docDate ?? new Date().toISOString().split("T")[0]).slice(0, 10);
  if (date > closingDate) return; // التاريخ بعد فترة الإغلاق — مسموح

  // التاريخ ضمن الفترة المقفلة
  // السماح للأدمن بالتجاوز إذا أرسل admin_override: true
  const isAdmin          = req.user?.role === "admin";
  const overrideRequested = req.body?.admin_override === true;
  if (isAdmin && overrideRequested) {
    void writeAuditLog({
      action:      "PERIOD_OVERRIDE",
      record_type: "financial_lock",
      record_id:   0,
      old_value:   { closing_date: closingDate, doc_date: docDate ?? "today", status: "LOCKED" },
      new_value:   { overridden: true, admin: req.user?.username, role: "admin" },
      user:        { id: req.user?.id, username: req.user?.username },
    });
    return;
  }

  const adminHint = isAdmin ? " (المدير: أرسل admin_override: true للتجاوز)" : "";
  throw httpError(423,
    `لا يمكن تعديل هذا السجل لأنه ضمن فترة مالية مغلقة (حتى ${closingDate}).` +
    ` للتصحيح، استخدم إجراءً عكسياً أو سند/قيد تصحيحي جديد.` +
    adminHint
  );
}

/** مسح الذاكرة المؤقتة (يُستدعى عند تغيير الإعداد) */
export function invalidateClosingDateCache(companyId?: number): void {
  if (companyId !== undefined) {
    cache.delete(companyId);
  } else {
    cache.clear();
  }
}
