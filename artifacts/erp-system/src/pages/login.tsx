import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { User, Lock, LogIn, Shield } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface ErpUser { id: number; name: string; username: string; pin: string; role: string; active: boolean; }

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير",
  manager: "مشرف",
  cashier: "كاشير",
  salesperson: "مندوب مبيعات",
};

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const { data: users = [] } = useQuery<ErpUser[]>({
    queryKey: ["/api/settings/users"],
    queryFn: () => fetch(api("/api/settings/users")).then(r => r.json()),
  });

  const activeUsers = users.filter(u => u.active !== false);
  const selectedUser = activeUsers.find(u => String(u.id) === selectedUserId);

  const handlePinKey = (key: string) => {
    if (key === "del") { setPin(p => p.slice(0, -1)); return; }
    if (pin.length < 6) setPin(p => p + key);
  };

  const handleLogin = async () => {
    if (!selectedUser) { setError("اختر المستخدم"); return; }
    if (!pin) { setError("أدخل الرقم السري"); return; }
    setLoading(true);
    setError("");
    await new Promise(r => setTimeout(r, 400));
    if (selectedUser.pin !== pin && selectedUser.pin !== "0000") {
      setError("الرقم السري غير صحيح");
      setPin("");
      setLoading(false);
      return;
    }
    login({ id: selectedUser.id, name: selectedUser.name, username: selectedUser.username, role: selectedUser.role });
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      <div
        className="fixed inset-0 z-0 opacity-30 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-mesh.png)` }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-br from-black/90 via-background/95 to-black/90 pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-2xl shadow-amber-500/20">
                <img
                  src={`${import.meta.env.BASE_URL}logo.png`}
                  alt="Halal Tech"
                  className="w-16 h-16 object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-background">
                <Shield className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-wide">Halal Tech</h1>
          <p className="text-amber-400/80 text-sm mt-1">الحلال = البركة</p>
          <p className="text-white/30 text-xs mt-3">نظام إدارة الموارد المتكامل</p>
        </div>

        {/* Login Card */}
        <div className="glass-panel rounded-3xl p-7 border border-white/10 shadow-2xl shadow-black/50 space-y-5">
          <h2 className="text-lg font-bold text-white/90 text-center">تسجيل الدخول</h2>

          {/* User Selection */}
          <div className="space-y-1.5">
            <label className="text-white/50 text-xs flex items-center gap-1.5">
              <User className="w-3 h-3" /> المستخدم
            </label>
            <select
              className="glass-input w-full appearance-none text-white text-sm"
              value={selectedUserId}
              onChange={e => { setSelectedUserId(e.target.value); setPin(""); setError(""); }}
            >
              <option value="" className="bg-gray-900">-- اختر اسمك --</option>
              {activeUsers.map(u => (
                <option key={u.id} value={u.id} className="bg-gray-900">
                  {u.name} ({ROLE_LABELS[u.role] || u.role})
                </option>
              ))}
            </select>
          </div>

          {/* PIN Display */}
          <div className="space-y-1.5">
            <label className="text-white/50 text-xs flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> الرقم السري
            </label>
            <div className="flex gap-2 justify-center py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all ${
                    i < pin.length
                      ? 'border-amber-500 bg-amber-500/20'
                      : 'border-white/20 bg-white/5'
                  }`}>
                  {i < pin.length && <div className="w-3 h-3 rounded-full bg-amber-400" />}
                </div>
              ))}
            </div>
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9','','0','del'].map((k) => (
              k === '' ? <div key="empty" /> :
              <button
                key={k}
                onClick={() => handlePinKey(k)}
                className={`h-12 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                  k === 'del'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-xs'
                    : 'bg-white/8 text-white border border-white/10 hover:bg-white/15 hover:border-amber-500/30'
                }`}
              >
                {k === 'del' ? '⌫' : k}
              </button>
            ))}
          </div>

          {error && (
            <div className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !selectedUserId || pin.length < 1}
            className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-40"
          >
            {loading ? (
              <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {loading ? "جاري التحقق..." : "دخول"}
          </button>

          {selectedUser?.pin === "0000" && pin.length === 0 && (
            <p className="text-white/30 text-xs text-center">الرقم السري الافتراضي: 0000</p>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          Halal Tech ERP v2.0 — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
