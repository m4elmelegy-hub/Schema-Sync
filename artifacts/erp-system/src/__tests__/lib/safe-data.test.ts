import { describe, it, expect } from "vitest";
import { safeArray, safeObject } from "@/lib/safe-data";

/* ─────────────────────────────────────────────────────────────── */
/* safeArray                                                        */
/* ─────────────────────────────────────────────────────────────── */
describe("safeArray", () => {
  it("returns the same array when given an array", () => {
    const arr = [1, 2, 3];
    expect(safeArray(arr)).toBe(arr);
  });

  it("returns [] for null", () => {
    expect(safeArray(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(safeArray(undefined)).toEqual([]);
  });

  it("returns [] for a plain string", () => {
    expect(safeArray("hello")).toEqual([]);
  });

  it("returns [] for a number", () => {
    expect(safeArray(42)).toEqual([]);
  });

  it("unwraps { data: [...] } envelope responses", () => {
    const response = { data: [{ id: 1 }, { id: 2 }] };
    expect(safeArray(response)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("returns [] when envelope data field is not an array", () => {
    const response = { data: "not-an-array" };
    expect(safeArray(response)).toEqual([]);
  });

  it("returns [] for an empty object", () => {
    expect(safeArray({})).toEqual([]);
  });

  it("returns [] for a boolean", () => {
    expect(safeArray(true)).toEqual([]);
  });

  it("returns an empty array for an empty array", () => {
    expect(safeArray([])).toEqual([]);
  });

  it("preserves typed elements", () => {
    const input = [{ id: 1, name: "محمد" }, { id: 2, name: "أحمد" }];
    const result = safeArray<{ id: number; name: string }>(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("محمد");
  });

  it("unwraps typed envelope", () => {
    const input = { data: [{ id: 10 }] };
    const result = safeArray<{ id: number }>(input);
    expect(result[0].id).toBe(10);
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* safeObject                                                       */
/* ─────────────────────────────────────────────────────────────── */
describe("safeObject", () => {
  const fallback = { id: 0, name: "default" };

  it("returns the value when it is a non-null object", () => {
    const obj = { id: 1, name: "test" };
    expect(safeObject(obj, fallback)).toBe(obj);
  });

  it("returns fallback for null", () => {
    expect(safeObject(null, fallback)).toBe(fallback);
  });

  it("returns fallback for undefined", () => {
    expect(safeObject(undefined, fallback)).toBe(fallback);
  });

  it("returns fallback for a string", () => {
    expect(safeObject("text", fallback)).toBe(fallback);
  });

  it("returns fallback for a number", () => {
    expect(safeObject(42, fallback)).toBe(fallback);
  });

  it("returns fallback for an array (arrays are objects but should be excluded)", () => {
    expect(safeObject([1, 2, 3], fallback)).toBe(fallback);
  });

  it("returns fallback for a boolean", () => {
    expect(safeObject(false, fallback)).toBe(fallback);
  });

  it("returns an empty object when value is {}", () => {
    const result = safeObject({}, fallback);
    expect(result).toEqual({});
  });
});
