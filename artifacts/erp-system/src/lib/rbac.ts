/**
 * Frontend RBAC utilities.
 * These are UI-level guards only — real security is enforced on the backend.
 */
import {
  LayoutDashboard, ClipboardList, Receipt, CreditCard,
  Package, Warehouse, Users, TrendingUp, Activity,
  FileText, Settings,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "admin" | "manager" | "cashier" | "salesperson";
export type UserRole = AppRole;

/* ── Which roles can access each route ─────────────────── */
export const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/":                       ["admin", "manager", "cashier", "salesperson"],
  "/tasks":                  ["admin", "manager", "cashier", "salesperson"],
  "/sales":                  ["admin", "manager", "cashier", "salesperson"],
  "/purchases":              ["admin", "manager"],
  "/products":               ["admin", "manager", "cashier", "salesperson"],
  "/inventory":              ["admin", "manager", "cashier", "salesperson"],
  "/customers":              ["admin", "manager", "cashier", "salesperson"],
  "/profits":                ["admin", "manager"],
  "/financial-transactions": ["admin"],
  "/accounts":               ["admin"],
  "/journal-entries":        ["admin"],
  "/reports":                ["admin", "manager"],
  "/expenses":               ["admin", "manager"],
  "/income":                 ["admin", "manager"],
  "/receipt-vouchers":       ["admin", "manager"],
  "/deposit-vouchers":       ["admin", "manager"],
  "/payment-vouchers":       ["admin", "manager"],
  "/safe-transfers":         ["admin", "manager"],
  "/settings":               ["admin"],
};

/* ── Nav items with role visibility + icons ─────────────── */
export const NAV_ITEMS: { name: string; href: string; icon: LucideIcon; roles: AppRole[] }[] = [
  { name: "لوحة القيادة",      href: "/",                       icon: LayoutDashboard, roles: ["admin","manager","cashier","salesperson"] },
  { name: "المهام السريعة",    href: "/tasks",                  icon: ClipboardList,   roles: ["admin","manager","cashier","salesperson"] },
  { name: "المبيعات",          href: "/sales",                  icon: Receipt,         roles: ["admin","manager","cashier","salesperson"] },
  { name: "المشتريات",         href: "/purchases",              icon: CreditCard,      roles: ["admin","manager"] },
  { name: "المنتجات",          href: "/products",               icon: Package,         roles: ["admin","manager","cashier","salesperson"] },
  { name: "مراجعة المخزون",   href: "/inventory",              icon: Warehouse,       roles: ["admin","manager","cashier","salesperson"] },
  { name: "العملاء",           href: "/customers",              icon: Users,           roles: ["admin","manager","cashier","salesperson"] },
  { name: "الأرباح",           href: "/profits",                icon: TrendingUp,      roles: ["admin","manager"] },
  { name: "الحركات المالية",   href: "/financial-transactions", icon: Activity,        roles: ["admin"] },
  { name: "التقارير",          href: "/reports",                icon: FileText,        roles: ["admin","manager"] },
  { name: "الإعدادات",         href: "/settings",               icon: Settings,        roles: ["admin"] },
];

/* ── Helpers ────────────────────────────────────────────── */
export function canAccess(role: string | undefined, route: string): boolean {
  if (!role) return false;
  const allowed = ROUTE_ROLES[route];
  if (!allowed) return true;
  return allowed.includes(role as AppRole);
}

export function isAdmin(role?: string)   { return role === "admin"; }
export function isManager(role?: string) { return role === "admin" || role === "manager"; }

export const ROLE_LABELS: Record<string, string> = {
  admin:       "مدير النظام",
  manager:     "مشرف",
  cashier:     "كاشير",
  salesperson: "مندوب مبيعات",
};
