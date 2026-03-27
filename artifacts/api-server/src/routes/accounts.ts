import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, accountsTable, journalEntriesTable, journalEntryLinesTable } from "@workspace/db";

const router: IRouter = Router();

function fmt(a: typeof accountsTable.$inferSelect) {
  return { ...a, opening_balance: Number(a.opening_balance), current_balance: Number(a.current_balance) };
}

// ── دليل الحسابات ──────────────────────────────────────────
router.get("/accounts", async (_req, res): Promise<void> => {
  const accounts = await db.select().from(accountsTable).orderBy(asc(accountsTable.code));
  res.json(accounts.map(fmt));
});

router.post("/accounts", async (req, res): Promise<void> => {
  const { code, name, type, parent_id, level, is_posting, opening_balance } = req.body;
  if (!code || !name || !type) { res.status(400).json({ error: "code/name/type مطلوبة" }); return; }
  const [acc] = await db.insert(accountsTable).values({
    code, name, type,
    parent_id: parent_id ?? null,
    level: level ?? 1,
    is_posting: is_posting !== false,
    opening_balance: String(opening_balance ?? 0),
    current_balance: String(opening_balance ?? 0),
  }).returning();
  res.status(201).json(fmt(acc));
});

router.put("/accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, is_active, is_posting } = req.body;
  const [acc] = await db.update(accountsTable)
    .set({ name, is_active, is_posting })
    .where(eq(accountsTable.id, id)).returning();
  if (!acc) { res.status(404).json({ error: "الحساب غير موجود" }); return; }
  res.json(fmt(acc));
});

router.delete("/accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(accountsTable).where(eq(accountsTable.id, id));
  res.json({ success: true });
});

// ── القيود اليومية ─────────────────────────────────────────
function fmtEntry(e: typeof journalEntriesTable.$inferSelect) {
  return {
    ...e,
    total_debit: Number(e.total_debit),
    total_credit: Number(e.total_credit),
    created_at: e.created_at.toISOString(),
  };
}

router.get("/journal-entries", async (_req, res): Promise<void> => {
  const entries = await db.select().from(journalEntriesTable)
    .orderBy(journalEntriesTable.created_at);
  res.json(entries.map(fmtEntry).reverse());
});

router.get("/journal-entries/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  if (!entry) { res.status(404).json({ error: "غير موجود" }); return; }
  const lines = await db.select().from(journalEntryLinesTable)
    .where(eq(journalEntryLinesTable.entry_id, id));
  res.json({
    ...fmtEntry(entry),
    lines: lines.map(l => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })),
  });
});

router.post("/journal-entries", async (req, res): Promise<void> => {
  const { date, description, reference, lines, status } = req.body;
  if (!date || !description || !lines?.length) {
    res.status(400).json({ error: "البيانات غير مكتملة" }); return;
  }
  const totalDebit = lines.reduce((s: number, l: { debit?: number }) => s + (l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s: number, l: { credit?: number }) => s + (l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    res.status(400).json({ error: "القيد غير متوازن — المدين لا يساوي الدائن" }); return;
  }
  const count = await db.select().from(journalEntriesTable);
  const entry_no = `JE-${String(count.length + 1).padStart(5, "0")}`;
  const [entry] = await db.insert(journalEntriesTable).values({
    entry_no, date, description,
    reference: reference ?? null,
    status: status ?? "draft",
    total_debit: String(totalDebit),
    total_credit: String(totalCredit),
  }).returning();

  for (const line of lines) {
    const [acc] = await db.select().from(accountsTable).where(eq(accountsTable.id, line.account_id));
    await db.insert(journalEntryLinesTable).values({
      entry_id: entry.id,
      account_id: line.account_id,
      account_name: acc?.name ?? line.account_name ?? "",
      account_code: acc?.code ?? line.account_code ?? "",
      debit: String(line.debit ?? 0),
      credit: String(line.credit ?? 0),
      description: line.description ?? null,
    });
    // Update account balance
    if (acc) {
      const impact = (acc.type === "asset" || acc.type === "expense")
        ? (line.debit ?? 0) - (line.credit ?? 0)
        : (line.credit ?? 0) - (line.debit ?? 0);
      if (status === "posted") {
        await db.update(accountsTable)
          .set({ current_balance: String(Number(acc.current_balance) + impact) })
          .where(eq(accountsTable.id, acc.id));
      }
    }
  }
  res.status(201).json(fmtEntry(entry));
});

router.patch("/journal-entries/:id/post", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [entry] = await db.update(journalEntriesTable)
    .set({ status: "posted" })
    .where(eq(journalEntriesTable.id, id)).returning();
  if (!entry) { res.status(404).json({ error: "غير موجود" }); return; }

  const lines = await db.select().from(journalEntryLinesTable).where(eq(journalEntryLinesTable.entry_id, id));
  for (const line of lines) {
    const [acc] = await db.select().from(accountsTable).where(eq(accountsTable.id, line.account_id));
    if (acc) {
      const impact = (acc.type === "asset" || acc.type === "expense")
        ? Number(line.debit) - Number(line.credit)
        : Number(line.credit) - Number(line.debit);
      await db.update(accountsTable)
        .set({ current_balance: String(Number(acc.current_balance) + impact) })
        .where(eq(accountsTable.id, acc.id));
    }
  }
  res.json(fmtEntry(entry));
});

router.delete("/journal-entries/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(journalEntryLinesTable).where(eq(journalEntryLinesTable.entry_id, id));
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  res.json({ success: true });
});

export default router;
