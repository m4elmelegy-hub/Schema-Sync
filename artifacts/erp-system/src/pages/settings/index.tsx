import { lazy, Suspense, useState } from "react";
import {
  Users, BookOpen, Lock, Store, HardDrive, Database, Loader2, Settings,
} from "lucide-react";

/* ─── Lazy-load each tab ─── */
const UsersTab         = lazy(() => import("./users-tab"));
const OpeningBalanceTab = lazy(() => import("./opening-balance-tab"));
const FinancialLockTab  = lazy(() => import("./financial-lock-tab"));
const CurrencyTab      = lazy(() => import("./currency-tab"));
const BackupTab        = lazy(() => import("./backup-tab"));
const DataTab          = lazy(() => import("./data-tab"));

/* ─── Tab types ─── */
type Tab = "users" | "opening-balance" | "financial-lock" | "currency" | "backup" | "data";

/* ─── Section config (explicit iteration — NOT flatMap, preserves section headers) ─── */
const TAB_SECTIONS: { section: string; tabs: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] }[] = [
  {
    section: "الإدارة",
    tabs: [
      { id: "users", label: "المستخدمون", icon: Users },
    ],
  },
  {
    section: "المالية",
    tabs: [
      { id: "opening-balance", label: "أول المدة",       icon: BookOpen },
      { id: "financial-lock",  label: "إغلاق الفترات",  icon: Lock },
    ],
  },
  {
    section: "التخصيص",
    tabs: [
      { id: "currency", label: "إعدادات المتجر", icon: Store },
    ],
  },
  {
    section: "النظام",
    tabs: [
      { id: "backup", label: "نسخ احتياطي", icon: HardDrive },
      { id: "data",   label: "البيانات",    icon: Database },
    ],
  },
];

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-white/5 rounded-xl" />
      <div className="h-4 w-64 bg-white/3 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 mt-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white/3 rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("users");

  /* Flat list only used for finding the active label */
  const allTabs = TAB_SECTIONS.flatMap(s => s.tabs);
  const activeLabel = allTabs.find(t => t.id === activeTab)?.label ?? "";

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden" dir="rtl">

      {/* ─────────── Sidebar ─────────── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-l border-white/8 overflow-y-auto"
        style={{ background: "var(--erp-bg-sidebar, #0B1120)" }}>
        <div className="px-4 pt-6 pb-2 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Settings className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-white/60 text-xs font-black uppercase tracking-widest">الإعدادات</p>
        </div>

        <nav className="px-3 pb-6 space-y-5 mt-3">
          {/* ── Render section headers explicitly — NOT flatMap ── */}
          {TAB_SECTIONS.map(section => (
            <div key={section.section}>
              {/* Section header */}
              <p className="text-white/25 text-[10px] font-black uppercase tracking-widest px-2 mb-1.5">
                {section.section}
              </p>

              {/* Tabs within section */}
              <div className="space-y-0.5">
                {section.tabs.map(tab => {
                  const active = activeTab === tab.id;
                  const Icon   = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-right ${
                        active
                          ? "bg-amber-500/15 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                          : "text-white/40 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-amber-400" : "text-white/30"}`} />
                      <span className="truncate">{tab.label}</span>
                      {active && (
                        <div className="mr-auto w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ─────────── Mobile Tab Bar ─────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/8 px-2 py-1 flex gap-1 overflow-x-auto"
        style={{ background: "var(--erp-bg-sidebar, #0B1120)" }}>
        {allTabs.map(tab => {
          const active = activeTab === tab.id;
          const Icon   = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                active ? "text-amber-400" : "text-white/30 hover:text-white/60"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] font-bold">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─────────── Main Content ─────────── */}
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-8">
        {/* Mobile header */}
        <div className="lg:hidden sticky top-0 z-30 px-4 py-3 border-b border-white/8 flex items-center gap-2"
          style={{ background: "var(--erp-bg-main, #0D1424)" }}>
          <Settings className="w-4 h-4 text-amber-400" />
          <p className="text-white font-bold text-sm">{activeLabel}</p>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
          <Suspense fallback={<TabSkeleton />}>
            {activeTab === "users"           && <UsersTab />}
            {activeTab === "opening-balance" && <OpeningBalanceTab />}
            {activeTab === "financial-lock"  && <FinancialLockTab />}
            {activeTab === "currency"        && <CurrencyTab />}
            {activeTab === "backup"          && <BackupTab />}
            {activeTab === "data"            && <DataTab />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
