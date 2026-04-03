import { useEffect, useState } from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  isPending?: boolean;
  countdown?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "حذف",
  isPending = false,
  countdown,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [seconds, setSeconds] = useState(countdown ?? 0);

  useEffect(() => {
    if (!countdown) return;
    setSeconds(countdown);
    const interval = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const canConfirm = !countdown || seconds === 0;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm modal-overlay"
      onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
    >
      <div className="glass-panel rounded-3xl p-8 w-full max-w-sm border border-white/10 shadow-2xl modal-panel">

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-white/50 text-sm mt-1 leading-relaxed">{description}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onConfirm}
            disabled={!canConfirm || isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />
            }
            {isPending
              ? "جاري الحذف..."
              : countdown && seconds > 0
                ? `${confirmLabel} (${seconds})`
                : confirmLabel
            }
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/15 active:scale-95 transition-all"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
