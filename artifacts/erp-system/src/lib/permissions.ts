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
  },
  manager: {
    can_create_sale:      true,
    can_cancel_sale:      true,
    can_edit_price:       true,
    can_manage_products:  true,
    can_manage_customers: true,
    can_view_inventory:   true,
    can_adjust_inventory: true,
  },
  salesperson: {
    can_create_sale:      true,
    can_cancel_sale:      false,
    can_edit_price:       false,
    can_manage_products:  false,
    can_manage_customers: false,
    can_view_inventory:   false,
    can_adjust_inventory: false,
  },
  cashier: {
    can_create_sale:      true,
    can_cancel_sale:      false,
    can_edit_price:       false,
    can_manage_products:  false,
    can_manage_customers: false,
    can_view_inventory:   false,
    can_adjust_inventory: false,
  },
};

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;

  const perms = user.permissions ?? {};

  // Only block when explicitly set to false; undefined → allow
  if (perms[permission] === false) return false;
  return true;
}
