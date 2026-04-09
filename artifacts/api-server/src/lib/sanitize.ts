import xss from "xss";

export function sanitizeString(input: string): string {
  if (typeof input !== "string") return input;
  return xss(input.trim());
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key in result) {
    if (typeof result[key] === "string") {
      (result as Record<string, unknown>)[key] = sanitizeString(result[key] as string);
    }
  }
  return result;
}
