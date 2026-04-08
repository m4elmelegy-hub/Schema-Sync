import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, LogOut } from "lucide-react";

export default function SubscriptionExpired() {
  const { logout } = useAuth();

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "hsl(225,28%,5%)", zIndex: 9999, direction: "rtl" }}
    >
      <div className="flex flex-col items-center gap-6 max-w-md text-center px-6">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">
            انتهت صلاحية الاشتراك
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            لقد انتهت صلاحية اشتراكك في النظام. يرجى التواصل مع المدير أو الدعم الفني
            لتجديد الاشتراك والاستمرار في استخدام النظام.
          </p>
        </div>

        {/* Contact box */}
        <div
          className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300"
        >
          <p className="font-medium mb-1">للتجديد تواصل مع المدير</p>
          <p className="text-amber-400/70 text-xs">
            بعد تجديد الاشتراك، أعد تسجيل الدخول للمتابعة
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white gap-2"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </Button>
          <Button
            variant="destructive"
            className="flex-1 gap-2"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>
      </div>
    </div>
  );
}
