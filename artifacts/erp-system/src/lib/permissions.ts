import type { AuthUser } from "@/contexts/auth";

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: {
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         true,
    can_credit_sale:          true,
    can_cancel_sale:          true,
    can_return_sale:          true,
    can_edit_price:           true,
    can_create_purchase:      true,
    can_cancel_purchase:      true,
    can_view_products:        true,
    can_manage_products:      true,
    can_view_customers:       true,
    can_manage_customers:     true,
    can_view_inventory:       true,
    can_adjust_inventory:     true,
    can_view_expenses:        true,
    can_add_expense:          true,
    can_add_receipt_voucher:  true,
    can_add_payment_voucher:  true,
    can_close_shift:          true,
    can_view_reports:         true,
    can_manage_users:         true,
  },
  manager: {
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         true,
    can_credit_sale:          true,
    can_cancel_sale:          true,
    can_return_sale:          true,
    can_edit_price:           true,
    can_create_purchase:      true,
    can_cancel_purchase:      true,
    can_view_products:        true,
    can_manage_products:      true,
    can_view_customers:       true,
    can_manage_customers:     true,
    can_view_inventory:       true,
    can_adjust_inventory:     true,
    can_view_expenses:        true,
    can_add_expense:          true,
    can_add_receipt_voucher:  true,
    can_add_payment_voucher:  true,
    can_close_shift:          true,
    can_view_reports:         true,
    can_manage_users:         false,
  },
  salesperson: {
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         true,
    can_credit_sale:          true,
    can_cancel_sale:          false,
    can_return_sale:          false,
    can_edit_price:           false,
    can_create_purchase:      false,
    can_cancel_purchase:      false,
    can_view_products:        false,
    can_manage_products:      false,
    can_view_customers:       true,
    can_manage_customers:     false,
    can_view_inventory:       false,
    can_adjust_inventory:     false,
    can_view_expenses:        false,
    can_add_expense:          false,
    can_add_receipt_voucher:  false,
    can_add_payment_voucher:  false,
    can_close_shift:          false,
    can_view_reports:         false,
    can_manage_users:         false,
  },
  cashier: {
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         false,
    can_credit_sale:          false,
    can_cancel_sale:          false,
    can_return_sale:          false,
    can_edit_price:           false,
    can_create_purchase:      false,
    can_cancel_purchase:      false,
    can_view_products:        false,
    can_manage_products:      false,
    can_view_customers:       false,
    can_manage_customers:     false,
    can_view_inventory:       false,
    can_adjust_inventory:     false,
    can_view_expenses:        true,
    can_add_expense:          true,
    can_add_receipt_voucher:  false,
    can_add_payment_voucher:  false,
    can_close_shift:          true,
    can_view_reports:         false,
    can_manage_users:         false,
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
