import type { AuthUser } from "../middleware/auth";

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: {
    can_create_sale:      true,
    can_cancel_sale:      true,
    can_edit_price:       true,
    can_manage_products:  true,
    can_manage_customers: true,
  },
  manager: {
    can_create_sale:      true,
    can_cancel_sale:      true,
    can_edit_price:       true,
    can_manage_products:  true,
    can_manage_customers: true,
  },
  salesperson: {
    can_create_sale:      true,
    can_cancel_sale:      false,
    can_edit_price:       false,
    can_manage_products:  false,
    can_manage_customers: false,
  },
  cashier: {
    can_create_sale:      true,
    can_cancel_sale:      false,
    can_edit_price:       false,
    can_manage_products:  false,
    can_manage_customers: false,
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
  } catch { /* ignore malformed JSON */ }

  if (permission in perms) {
    return perms[permission] === true;
  }

  const roleDefaults = ROLE_DEFAULTS[user.role] ?? ROLE_DEFAULTS.cashier;
  return roleDefaults[permission] ?? false;
}
