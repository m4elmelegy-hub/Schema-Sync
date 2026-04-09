// 🔒 ERP RULE: All API list data must be normalized using safeArray()
// ✔ DATA LAYER STABILIZED

/**
 * Safely converts any API response to a typed array.
 * Handles: array | { data: array } | null | undefined
 */
export function safeArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).data))
    return (value as Record<string, unknown>).data as T[];
  return [];
}

/**
 * Safely unwraps an object API response.
 * Returns the value if it's a non-null object, otherwise the fallback.
 */
export function safeObject<T = any>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  return fallback;
}
