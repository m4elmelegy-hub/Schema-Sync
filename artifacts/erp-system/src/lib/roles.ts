export function translateRole(role: string): string {
  const roles: Record<string, string> = {
    super_admin:    "المسؤول العام",
    company_admin:  "مدير الشركة",
    branch_manager: "مدير الفرع",
    admin:          "مدير النظام",
    manager:        "مشرف",
    cashier:        "كاشير",
    salesperson:    "مندوب مبيعات",
    agent:          "موظف مبيعات",
    client:         "عميل",
  };
  return roles[role] || role;
}
