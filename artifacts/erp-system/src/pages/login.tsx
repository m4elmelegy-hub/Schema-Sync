import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings, getLoginBgStyle } from "@/contexts/app-settings";
import { useLocation } from "wouter";
import { LogIn, Shield } from "lucide-react";

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
  const { settings } = useAppSettings();
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

  const handleLogin = async () => {
    if (!selectedUser) { setError("اختر المستخدم أولاً"); return; }
    if (!pin) { setError("أدخل الرقم السري"); return; }
    setLoading(true);
    setError("");
    await new Promise(r => setTimeout(r, 300));
    if (selectedUser.pin !== pin) {
      setError("الرقم السري غير صحيح");
      setPin("");
      setLoading(false);
      return;
    }
    login({ id: selectedUser.id, name: selectedUser.name, username: selectedUser.username, role: selectedUser.role });
    setLocation("/");
  };

  const bgStyle = getLoginBgStyle(settings.loginBg);
  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir="rtl"
      style={{ background: bgStyle }}>
      <div className="fixed inset-0 z-0 opacity-15 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-mesh.png)` }} />
      <div className="fixed inset-0 z-0 bg-black/40 pointer-events-none" />

      <div className="relative z-10 w-full max-w-xs">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-2xl shadow-amber-500/20">
                <img src={logoSrc} alt={settings.companyName}
                  className="w-16 h-16 object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-background">
                <Shield className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-wide">{settings.companyName}</h1>
          <p className="text-amber-400/80 text-sm mt-1">{settings.companySlogan}</p>
        </div>

        {/* Login Card */}
        <form
          onSubmit={e => { e.preventDefault(); handleLogin(); }}
          className="glass-panel rounded-3xl p-7 border border-white/10 shadow-2xl shadow-black/50 space-y-4"
        >
          <h2 className="text-base font-bold text-white/70 text-center">تسجيل الدخول</h2>

          {/* User Selection */}
          <div className="space-y-1.5">
            <label className="text-white/50 text-xs">المستخدم</label>
            <select
              className="glass-input w-full appearance-none text-white text-sm"
              value={selectedUserId}
              onChange={e => { setSelectedUserId(e.target.value); setPin(""); setError(""); }}
              autoFocus
            >
              <option value="" className="bg-gray-900">-- اختر اسمك --</option>
              {activeUsers.map(u => (
                <option key={u.id} value={u.id} className="bg-gray-900">
                  {u.name} — {ROLE_LABELS[u.role] || u.role}
                </option>
              ))}
            </select>
          </div>

          {/* PIN Input */}
          <div className="space-y-1.5">
            <label className="text-white/50 text-xs">الرقم السري</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              className="glass-input w-full text-white text-center text-xl tracking-widest"
              value={pin}
              onChange={e => { setPin(e.target.value); setError(""); }}
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl py-2 px-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !selectedUserId || !pin}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-40 mt-2"
          >
            {loading ? (
              <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {loading ? "جاري التحقق..." : "دخول"}
          </button>

          {selectedUser?.pin === "0000" && (
            <p className="text-white/25 text-xs text-center">الرقم السري الافتراضي: 0000</p>
          )}
        </form>

        <p className="text-center text-white/20 text-xs mt-5">
          Halal Tech ERP v2.0
        </p>
      </div>
    </div>
  );
}
