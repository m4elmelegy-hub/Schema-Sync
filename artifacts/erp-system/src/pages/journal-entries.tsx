import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, X, Trash2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface Account { id: number; code: string; name: string; type: string; is_posting: boolean; }
interface EntryLine { account_id: number; account_name: string; account_code: string; debit: number; credit: number; description: string; }
interface JournalEntry {
  id: number; entry_no: string; date: string; description: string;
  status: string; reference: string | null; total_debit: number; total_credit: number; created_at: string;
}
interface JournalEntryDetail extends JournalEntry { lines: EntryLine[]; }

function StatusBadge({ status }: { status: string }) {
  return status === "posted"
    ? <span className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center gap-1.5"><CheckCircle className="w-3 h-3" /> مرحَّل</span>
    : <span className="px-3 py-1 rounded-full text-xs font-bold border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">مسودة</span>;
}

function EntryDetailModal({ entryId, onClose }: { entryId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: entry, isLoading } = useQuery<JournalEntryDetail>({
    queryKey: ["/api/journal-entries", entryId],
    queryFn: () => fetch(api(`/api/journal-entries/${entryId}`)).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });
  const postMutation = useMutation({
    mutationFn: () => fetch(api(`/api/journal-entries/${entryId}/post`), { method: "PATCH" }).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/journal-entries"] }); toast({ title: "✅ تم ترحيل القيد" }); onClose(); },
  });
  const deleteMutation = useMutation({
    mutationFn: () => fetch(api(`/api/journal-entries/${entryId}`), { method: "DELETE" }).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/journal-entries"] }); toast({ title: "🗑 تم الحذف" }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-0 w-full max-w-3xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
          <div>
            <h3 className="text-xl font-bold text-white">تفاصيل القيد</h3>
            {entry && <p className="text-amber-400 font-mono text-sm mt-0.5">{entry.entry_no}</p>}
          </div>
          <div className="flex gap-2">
            {entry?.status === "draft" && (
              <>
                <button onClick={() => postMutation.mutate()} disabled={postMutation.isPending} className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-bold border border-emerald-500/30 transition-colors">
                  {postMutation.isPending ? "..." : "ترحيل القيد"}
                </button>
                <button onClick={() => { if (confirm("حذف القيد؟")) deleteMutation.mutate(); }} className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X className="w-4 h-4 text-white/70" /></button>
          </div>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          {isLoading ? <div className="text-center py-12 text-white/40">جاري التحميل...</div> : !entry ? null : (
            <>
              <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div><p className="text-white/50 text-xs">رقم القيد</p><p className="text-amber-400 font-bold font-mono">{entry.entry_no}</p></div>
                <div><p className="text-white/50 text-xs">التاريخ</p><p className="text-white">{entry.date}</p></div>
                <div><p className="text-white/50 text-xs">البيان</p><p className="text-white font-semibold">{entry.description}</p></div>
                <div><p className="text-white/50 text-xs">الحالة</p><div className="mt-1"><StatusBadge status={entry.status} /></div></div>
                {entry.reference && <div><p className="text-white/50 text-xs">المرجع</p><p className="text-white/70">{entry.reference}</p></div>}
              </div>
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-white/60">كود</th>
                      <th className="p-3 text-white/60">الحساب</th>
                      <th className="p-3 text-white/60">مدين</th>
                      <th className="p-3 text-white/60">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="p-3 font-mono text-xs text-white/50">{line.account_code}</td>
                        <td className="p-3 text-white">{line.account_name}</td>
                        <td className="p-3 font-bold text-blue-400">{line.debit > 0 ? formatCurrency(line.debit) : "—"}</td>
                        <td className="p-3 font-bold text-amber-400">{line.credit > 0 ? formatCurrency(line.credit) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td colSpan={2} className="p-3 text-white/60 font-bold">الإجمالي</td>
                      <td className="p-3 font-black text-blue-400">{formatCurrency(entry.total_debit)}</td>
                      <td className="p-3 font-black text-amber-400">{formatCurrency(entry.total_credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {Math.abs(entry.total_debit - entry.total_credit) < 0.01 ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold">
                  <CheckCircle className="w-4 h-4" /> القيد متوازن
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold">
                  <AlertCircle className="w-4 h-4" /> القيد غير متوازن! الفرق: {formatCurrency(Math.abs(entry.total_debit - entry.total_credit))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NewEntryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], description: "", reference: "" });
  const [lines, setLines] = useState<Array<{ account_id: string; debit: string; credit: string; description: string }>>([
    { account_id: "", debit: "", credit: "", description: "" },
    { account_id: "", debit: "", credit: "", description: "" },
  ]);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    queryFn: () => fetch(api("/api/accounts")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const postingAccounts = accounts.filter(a => a.is_posting);
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const createMutation = useMutation({
    mutationFn: (data: object) => fetch(api("/api/journal-entries"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/journal-entries"] }); toast({ title: "✅ تم حفظ القيد" }); onClose(); },
    onError: (e: Error) => toast({ title: e.message || "حدث خطأ", variant: "destructive" }),
  });

  const addLine = () => setLines(prev => [...prev, { account_id: "", debit: "", credit: "", description: "" }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, val: string) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));

  const handleSave = (status: "draft" | "posted") => {
    const mappedLines = lines.filter(l => l.account_id).map(l => ({
      account_id: parseInt(l.account_id),
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      description: l.description || null,
    }));
    if (mappedLines.length < 2) { toast({ title: "أضف سطرين على الأقل", variant: "destructive" }); return; }
    createMutation.mutate({ ...form, lines: mappedLines, status });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-3xl p-0 w-full max-w-4xl border border-white/10 shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
          <h3 className="text-xl font-bold text-white">قيد يومي جديد</h3>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X className="w-4 h-4 text-white/70" /></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-white/60 text-xs mb-1 block">التاريخ *</label><input type="date" className="glass-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label className="text-white/60 text-xs mb-1 block">البيان *</label><input type="text" className="glass-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف القيد" /></div>
            <div><label className="text-white/60 text-xs mb-1 block">المرجع</label><input type="text" className="glass-input" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="رقم مرجعي اختياري" /></div>
          </div>

          {/* أسطر القيد */}
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <table className="w-full text-right text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-3 text-white/60">الحساب</th>
                  <th className="p-3 text-white/60">مدين</th>
                  <th className="p-3 text-white/60">دائن</th>
                  <th className="p-3 text-white/60">بيان</th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="p-2">
                      <select className="glass-input text-sm appearance-none w-full" value={line.account_id} onChange={e => updateLine(i, "account_id", e.target.value)}>
                        <option value="" className="bg-gray-900">اختر الحساب</option>
                        {postingAccounts.map(a => <option key={a.id} value={a.id} className="bg-gray-900">[{a.code}] {a.name}</option>)}
                      </select>
                    </td>
                    <td className="p-2"><input type="number" step="0.01" min="0" placeholder="0.00" className="glass-input text-sm text-blue-300 w-full" value={line.debit} onChange={e => { updateLine(i, "debit", e.target.value); if (e.target.value) updateLine(i, "credit", ""); }} /></td>
                    <td className="p-2"><input type="number" step="0.01" min="0" placeholder="0.00" className="glass-input text-sm text-amber-300 w-full" value={line.credit} onChange={e => { updateLine(i, "credit", e.target.value); if (e.target.value) updateLine(i, "debit", ""); }} /></td>
                    <td className="p-2"><input type="text" placeholder="اختياري" className="glass-input text-sm w-full" value={line.description} onChange={e => updateLine(i, "description", e.target.value)} /></td>
                    <td className="p-2">
                      {lines.length > 2 && <button onClick={() => removeLine(i)} className="p-1 text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td className="p-3 text-white/60 font-bold">الإجمالي</td>
                  <td className="p-3 font-black text-blue-400">{formatCurrency(totalDebit)}</td>
                  <td className="p-3 font-black text-amber-400">{formatCurrency(totalCredit)}</td>
                  <td colSpan={2} className="p-3">
                    {isBalanced
                      ? <span className="text-emerald-400 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> متوازن</span>
                      : totalDebit > 0 && <span className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> فرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <button onClick={addLine} className="flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm transition-colors">
            <Plus className="w-4 h-4" /> إضافة سطر
          </button>
        </div>
        <div className="p-6 border-t border-white/10 bg-black/30 flex gap-3">
          <button onClick={() => handleSave("posted")} disabled={!isBalanced || !form.description || createMutation.isPending} className="flex-1 btn-primary py-3 disabled:opacity-50">
            {createMutation.isPending ? "..." : "ترحيل الآن"}
          </button>
          <button onClick={() => handleSave("draft")} disabled={!form.description || createMutation.isPending} className="flex-1 btn-secondary py-3">
            حفظ كمسودة
          </button>
          <button onClick={onClose} className="px-6 btn-secondary py-3">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

export default function JournalEntries() {
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "posted">("all");

  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal-entries"],
    queryFn: () => fetch(api("/api/journal-entries")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const filtered = entries.filter(e => filter === "all" || e.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
          {[["all", "الكل"], ["draft", "مسودة"], ["posted", "مرحَّل"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v as "all" | "draft" | "posted")}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${filter === v ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm mr-auto">
          <Plus className="w-4 h-4" /> قيد جديد
        </button>
      </div>

      {showNew && <NewEntryModal onClose={() => setShowNew(false)} />}
      {selectedId && <EntryDetailModal entryId={selectedId} onClose={() => setSelectedId(null)} />}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/60 font-semibold">رقم القيد</th>
                <th className="p-4 text-white/60 font-semibold">التاريخ</th>
                <th className="p-4 text-white/60 font-semibold">البيان</th>
                <th className="p-4 text-white/60 font-semibold">إجمالي مدين</th>
                <th className="p-4 text-white/60 font-semibold">إجمالي دائن</th>
                <th className="p-4 text-white/60 font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-12 text-center text-white/40">لا توجد قيود</td></tr>
              ) : filtered.map(entry => (
                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedId(entry.id)}>
                  <td className="p-4 font-bold text-amber-400 font-mono">{entry.entry_no}</td>
                  <td className="p-4 text-white/70">{entry.date}</td>
                  <td className="p-4 text-white font-medium">{entry.description}</td>
                  <td className="p-4 font-bold text-blue-400">{formatCurrency(entry.total_debit)}</td>
                  <td className="p-4 font-bold text-amber-300">{formatCurrency(entry.total_credit)}</td>
                  <td className="p-4"><StatusBadge status={entry.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
