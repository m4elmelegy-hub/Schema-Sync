import type { AuthUser } from "@/contexts/auth";

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: {
    can_create_sale:      true,
    can_cancel_sale:      true,
    can_edit_price:       true,
    can_manage_products:  true,
    can_manage_customers: true,
    can_view_inventory:   true,
    can_adjust_inventory: true,
    can_view_products:    true,
    can_view_customers:   true,
    can_view_expenses:    true,
    can_view_reports:     true,
  },
  manager: {
    can_create_sale:      true,
    can_cancel_sale:      true,
    can_edit_price:       true,
    can_manage_products:  true,
    can_manage_customers: true,
    can_view_inventory:   true,
    can_adjust_inventory: true,
    can_view_products:    true,
    can_view_customers:   true,
    can_view_expenses:    true,
    can_view_reports:     true,
  },
  salesperson: {
    can_create_sale:      true,
    can_cancel_sale:      false,
    can_edit_price:       false,
    can_manage_products:  false,
    can_manage_customers: false,
    can_view_inventory:   false,
    can_adjust_inventory: false,
    can_view_products:    false,
    can_view_customers:   false,
    can_view_expenses:    false,
    can_view_reports:     false,
  },
  cashier: {
    can_create_sale:      true,
    can_cancel_sale:      false,
    can_edit_price:       false,
    can_manage_products:  false,
    can_manage_customers: false,
    can_view_inventory:   false,
    can_adjust_inventory: false,
    can_view_products:    false,
    can_view_customers:   false,
    can_view_expenses:    false,
    can_view_reports:     false,
  },
};

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;

  const perms = user.permissions ?? {};

  // Explicit user-level override always wins
  if (perms[permission] === true)  return true;
  if (perms[permission] === false) return false;

  // Fall back to role defaults
  const roleDefaults = ROLE_DEFAULTS[user.role] ?? {};
  if (roleDefaults[permission] === true)  return true;
  if (roleDefaults[permission] === false) return false;

  // Final fallback: admin/manager allow unknown perms, others deny
  return user.role === "admin" || user.role === "manager";
}
