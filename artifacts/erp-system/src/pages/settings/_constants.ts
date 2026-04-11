export const ROLES: Record<string, { label: string; badge: string; avatarBg: string; avatarText: string }> = {
  super_admin:    { label: "المسؤول العام",  badge: "text-orange-400 bg-orange-500/15 border-orange-500/30",   avatarBg: "bg-orange-500/20",  avatarText: "text-orange-300"  },
  company_admin:  { label: "مدير الشركة",    badge: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",   avatarBg: "bg-yellow-500/20",  avatarText: "text-yellow-300"  },
  branch_manager: { label: "مدير الفرع",     badge: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",         avatarBg: "bg-cyan-500/20",    avatarText: "text-cyan-300"    },
  admin:          { label: "مدير النظام",    badge: "text-red-400 bg-red-500/15 border-red-500/30",            avatarBg: "bg-red-500/20",     avatarText: "text-red-300"     },
  manager:        { label: "مشرف",           badge: "text-purple-400 bg-purple-500/15 border-purple-500/30",   avatarBg: "bg-purple-500/20",  avatarText: "text-purple-300"  },
  cashier:        { label: "كاشير",          badge: "text-blue-400 bg-blue-500/15 border-blue-500/30",         avatarBg: "bg-blue-500/20",    avatarText: "text-blue-300"    },
  salesperson:    { label: "مندوب مبيعات",   badge: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", avatarBg: "bg-emerald-500/20", avatarText: "text-emerald-300" },
  agent:          { label: "موظف مبيعات",    badge: "text-teal-400 bg-teal-500/15 border-teal-500/30",         avatarBg: "bg-teal-500/20",    avatarText: "text-teal-300"    },
  client:         { label: "عميل",           badge: "text-slate-400 bg-slate-500/15 border-slate-500/30",      avatarBg: "bg-slate-500/20",   avatarText: "text-slate-300"   },
};

export interface PermEntry { key: string; label: string }
export interface PermGroup  { key: string; label: string; color: string; permissions: PermEntry[] }

export const PERMISSION_GROUPS: PermGroup[] = [
  {
    key: "sales", label: "المبيعات", color: "amber",
    permissions: [
      { key: "can_view_sales",   label: "عرض قائمة المبيعات" },
      { key: "can_create_sale",  label: "إنشاء فاتورة بيع" },
      { key: "can_cash_sale",    label: "بيع نقدي" },
      { key: "can_partial_sale", label: "بيع جزئي" },
      { key: "can_credit_sale",  label: "بيع آجل" },
      { key: "can_return_sale",  label: "إرجاع مبيعات" },
      { key: "can_cancel_sale",  label: "إلغاء فاتورة بيع" },
      { key: "can_edit_price",   label: "تعديل الأسعار" },
    ],
  },
  {
    key: "inventory", label: "المخزون والمشتريات", color: "blue",
    permissions: [
      { key: "can_view_products",    label: "عرض الأصناف" },
      { key: "can_manage_products",  label: "إدارة الأصناف (إضافة/تعديل/حذف)" },
      { key: "can_view_inventory",   label: "عرض المخزون" },
      { key: "can_adjust_inventory", label: "تسوية المخزون" },
      { key: "can_view_purchases",   label: "عرض قائمة المشتريات" },
      { key: "can_create_purchase",  label: "إنشاء فاتورة شراء" },
      { key: "can_cancel_purchase",  label: "إلغاء فاتورة شراء" },
    ],
  },
  {
    key: "customers", label: "العملاء", color: "emerald",
    permissions: [
      { key: "can_view_customers",   label: "عرض العملاء" },
      { key: "can_manage_customers", label: "إدارة العملاء (إضافة/تعديل/حذف)" },
    ],
  },
  {
    key: "finance", label: "المالية والخزينة", color: "violet",
    permissions: [
      { key: "can_view_treasury",       label: "عرض صفحة الخزينة" },
      { key: "can_view_expenses",       label: "عرض المصروفات" },
      { key: "can_add_expense",         label: "إضافة مصروف" },
      { key: "can_add_receipt_voucher", label: "سند قبض" },
      { key: "can_add_payment_voucher", label: "سند دفع" },
      { key: "can_close_shift",         label: "إقفال الخزنة / إنهاء الوردية" },
    ],
  },
  {
    key: "reports", label: "التقارير", color: "cyan",
    permissions: [
      { key: "can_view_reports", label: "عرض التقارير" },
    ],
  },
  {
    key: "system", label: "النظام", color: "red",
    permissions: [
      { key: "can_manage_users", label: "إدارة المستخدمين" },
    ],
  },
];

export const PERMISSION_TEMPLATES: Record<string, Record<string, boolean>> = {
  admin: {
    can_view_sales: true, can_create_sale: true, can_cash_sale: true,
    can_partial_sale: true, can_credit_sale: true, can_return_sale: true,
    can_cancel_sale: true, can_edit_price: true,
    can_view_purchases: true, can_create_purchase: true, can_cancel_purchase: true,
    can_view_products: true, can_manage_products: true,
    can_view_inventory: true, can_adjust_inventory: true,
    can_view_customers: true, can_manage_customers: true,
    can_view_treasury: true, can_view_expenses: true, can_add_expense: true,
    can_add_receipt_voucher: true, can_add_payment_voucher: true,
    can_close_shift: true, can_view_reports: true, can_manage_users: true,
  },
  manager: {
    can_view_sales: true, can_create_sale: true, can_cash_sale: true,
    can_partial_sale: true, can_credit_sale: true, can_return_sale: true,
    can_cancel_sale: true, can_edit_price: true,
    can_view_purchases: true, can_create_purchase: true, can_cancel_purchase: true,
    can_view_products: true, can_manage_products: true,
    can_view_inventory: true, can_adjust_inventory: true,
    can_view_customers: true, can_manage_customers: true,
    can_view_treasury: true, can_view_expenses: true, can_add_expense: true,
    can_add_receipt_voucher: true, can_add_payment_voucher: true,
    can_close_shift: true, can_view_reports: true, can_manage_users: false,
  },
  salesperson: {
    can_view_sales: true, can_create_sale: true, can_cash_sale: true,
    can_partial_sale: true, can_credit_sale: true, can_return_sale: false,
    can_cancel_sale: false, can_edit_price: false,
    can_view_purchases: false, can_create_purchase: false, can_cancel_purchase: false,
    can_view_products: true, can_manage_products: false,
    can_view_inventory: false, can_adjust_inventory: false,
    can_view_customers: true, can_manage_customers: false,
    can_view_treasury: true, can_view_expenses: false, can_add_expense: false,
    can_add_receipt_voucher: false, can_add_payment_voucher: false,
    can_close_shift: false, can_view_reports: false, can_manage_users: false,
  },
  cashier: {
    can_view_sales: true, can_create_sale: true, can_cash_sale: true,
    can_partial_sale: false, can_credit_sale: false, can_return_sale: false,
    can_cancel_sale: false, can_edit_price: false,
    can_view_purchases: false, can_create_purchase: false, can_cancel_purchase: false,
    can_view_products: true, can_manage_products: false,
    can_view_inventory: false, can_adjust_inventory: false,
    can_view_customers: true, can_manage_customers: false,
    can_view_treasury: true, can_view_expenses: true, can_add_expense: true,
    can_add_receipt_voucher: false, can_add_payment_voucher: false,
    can_close_shift: true, can_view_reports: false, can_manage_users: false,
  },
};

export const TEMPLATE_LABELS: { value: string; label: string }[] = [
  { value: "admin",       label: "مدير النظام — كل الصلاحيات" },
  { value: "manager",     label: "مشرف — كل الصلاحيات" },
  { value: "salesperson", label: "مندوب مبيعات — إنشاء فواتير فقط" },
  { value: "cashier",     label: "كاشير — إنشاء فواتير فقط" },
];

export const COLOR_MAP: Record<string, { header: string; badge: string; toggleOn: string }> = {
  amber:  { header: "border-amber-500/20",   badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",   toggleOn: "#f59e0b" },
  blue:   { header: "border-blue-500/20",    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",     toggleOn: "#3b82f6" },
  emerald:{ header: "border-emerald-500/20", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", toggleOn: "#10b981" },
  violet: { header: "border-violet-500/20",  badge: "bg-violet-500/15 text-violet-300 border-violet-500/30", toggleOn: "#8b5cf6" },
  cyan:   { header: "border-cyan-500/20",    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",     toggleOn: "#06b6d4" },
  red:    { header: "border-red-500/20",     badge: "bg-red-500/15 text-red-300 border-red-500/30",       toggleOn: "#ef4444" },
};

export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  lock_period:        { label: "إغلاق فترة",    color: "text-red-400 bg-red-500/10 border-red-500/20" },
  unlock_period:      { label: "فتح فترة",      color: "text-green-400 bg-green-500/10 border-green-500/20" },
  lock_blocked:       { label: "محاولة مرفوضة", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  reversal_created:   { label: "سند عكسي",      color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  correction_created: { label: "سند تصحيحي",    color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  create:             { label: "إنشاء",         color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  update:             { label: "تعديل",         color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  delete:             { label: "حذف",           color: "text-red-400 bg-red-500/10 border-red-500/20" },
  INVENTORY_TRANSFER: { label: "تحويل مخزون",   color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
};

export const BACKUP_MODULES_LIST = [
  { key: "sales",     label: "المبيعات",         sub: "الفواتير، العملاء، المرتجعات",      url: "/api/sales" },
  { key: "purchases", label: "المشتريات",         sub: "فواتير المشتريات، المرتجعات",        url: "/api/purchases" },
  { key: "products",  label: "المخزن",            sub: "الأصناف، الكميات، الحركات",         url: "/api/products" },
  { key: "treasury",  label: "الخزينة",           sub: "الإيرادات، المصروفات، السندات",     url: "/api/financial-transactions" },
  { key: "customers", label: "العملاء",            sub: "الأرصدة والبيانات",                 url: "/api/customers" },
  { key: "settings",  label: "الإعدادات",         sub: "العملة والتفضيلات",                 url: null },
  { key: "reports",   label: "التقارير المحفوظة", sub: "الإحصائيات والبيانات التاريخية",    url: null },
] as const;

export const DATA_GROUPS = [
  { key: "sales",            label: "المبيعات",        sub: "فواتير البيع والمدفوعات" },
  { key: "purchases",        label: "المشتريات",        sub: "فواتير الشراء وتكاليفها" },
  { key: "expenses",         label: "المصروفات",        sub: "جميع سجلات المصروفات" },
  { key: "income",           label: "الإيرادات",        sub: "جميع سجلات الإيرادات" },
  { key: "receipt_vouchers", label: "سندات القبض",      sub: "مدفوعات العملاء" },
  { key: "deposit_vouchers", label: "سندات التوريد",    sub: "توريدات العملاء النقدية" },
  { key: "transactions",     label: "الحركات المالية",  sub: "السجل المركزي للمعاملات" },
  { key: "products",         label: "الأصناف",          sub: "بيانات المنتجات والمخزون" },
  { key: "customers",        label: "العملاء",          sub: "بيانات العملاء وأرصدتهم" },
];
