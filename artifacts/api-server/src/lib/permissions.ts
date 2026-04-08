import type { AuthUser } from "../middleware/auth";

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  super_admin: {
    can_view_sales:           true, can_create_sale:          true,
    can_cash_sale:            true, can_partial_sale:         true,
    can_credit_sale:          true, can_cancel_sale:          true,
    can_return_sale:          true, can_edit_price:           true,
    can_view_purchases:       true, can_create_purchase:      true,
    can_cancel_purchase:      true, can_view_products:        true,
    can_manage_products:      true, can_view_customers:       true,
    can_manage_customers:     true, can_view_inventory:       true,
    can_adjust_inventory:     true, can_view_treasury:        true,
    can_view_expenses:        true, can_add_expense:          true,
    can_add_receipt_voucher:  true, can_add_payment_voucher:  true,
    can_close_shift:          true, can_view_reports:         true,
    can_manage_users:         true,
  },
  admin: {
    can_view_sales:           true,
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         true,
    can_credit_sale:          true,
    can_cancel_sale:          true,
    can_return_sale:          true,
    can_edit_price:           true,
    can_view_purchases:       true,
    can_create_purchase:      true,
    can_cancel_purchase:      true,
    can_view_products:        true,
    can_manage_products:      true,
    can_view_customers:       true,
    can_manage_customers:     true,
    can_view_inventory:       true,
    can_adjust_inventory:     true,
    can_view_treasury:        true,
    can_view_expenses:        true,
    can_add_expense:          true,
    can_add_receipt_voucher:  true,
    can_add_payment_voucher:  true,
    can_close_shift:          true,
    can_view_reports:         true,
    can_manage_users:         true,
  },
  manager: {
    can_view_sales:           true,
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         true,
    can_credit_sale:          true,
    can_cancel_sale:          true,
    can_return_sale:          true,
    can_edit_price:           true,
    can_view_purchases:       true,
    can_create_purchase:      true,
    can_cancel_purchase:      true,
    can_view_products:        true,
    can_manage_products:      true,
    can_view_customers:       true,
    can_manage_customers:     true,
    can_view_inventory:       true,
    can_adjust_inventory:     true,
    can_view_treasury:        true,
    can_view_expenses:        true,
    can_add_expense:          true,
    can_add_receipt_voucher:  true,
    can_add_payment_voucher:  true,
    can_close_shift:          true,
    can_view_reports:         true,
    can_manage_users:         false,
  },
  salesperson: {
    can_view_sales:           true,
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         true,
    can_credit_sale:          true,
    can_cancel_sale:          false,
    can_return_sale:          false,
    can_edit_price:           false,
    can_view_purchases:       false,
    can_create_purchase:      false,
    can_cancel_purchase:      false,
    can_view_products:        true,
    can_manage_products:      false,
    can_view_customers:       true,
    can_manage_customers:     false,
    can_view_inventory:       false,
    can_adjust_inventory:     false,
    can_view_treasury:        true,
    can_view_expenses:        false,
    can_add_expense:          false,
    can_add_receipt_voucher:  false,
    can_add_payment_voucher:  false,
    can_close_shift:          false,
    can_view_reports:         false,
    can_manage_users:         false,
  },
  cashier: {
    can_view_sales:           true,
    can_create_sale:          true,
    can_cash_sale:            true,
    can_partial_sale:         false,
    can_credit_sale:          false,
    can_cancel_sale:          false,
    can_return_sale:          false,
    can_edit_price:           false,
    can_view_purchases:       false,
    can_create_purchase:      false,
    can_cancel_purchase:      false,
    can_view_products:        true,
    can_manage_products:      false,
    can_view_customers:       true,
    can_manage_customers:     false,
    can_view_inventory:       false,
    can_adjust_inventory:     false,
    can_view_treasury:        true,
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
  user: AuthUser | undefined,
  permission: string,
): boolean {
  if (!user) return false;

  let perms: Record<string, boolean> = {};
  try {
    const parsed = JSON.parse(user.permissions ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      perms = parsed as Record<string, boolean>;
    }
  } catch { /* ignore */ }

  // Explicit user-level override always wins
  if (perms[permission] === true)  return true;
  if (perms[permission] === false) return false;

  // Fall back to role defaults
  const roleDefaults = ROLE_DEFAULTS[user.role] ?? {};
  if (roleDefaults[permission] === true)  return true;
  if (roleDefaults[permission] === false) return false;

  // Final fallback: super_admin/admin/manager allow unknown perms, others deny
  return user.role === "super_admin" || user.role === "admin" || user.role === "manager";
}
