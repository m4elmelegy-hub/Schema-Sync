import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PrimaryBtn,
  DangerBtn,
  GhostBtn,
  SInput,
  SSelect,
  FieldLabel,
} from "@/pages/settings/_shared";

/* ─────────────────────────────────────────────────────────────── */
/* PrimaryBtn                                                       */
/* ─────────────────────────────────────────────────────────────── */
describe("PrimaryBtn", () => {
  it("renders children text", () => {
    render(<PrimaryBtn>حفظ</PrimaryBtn>);
    expect(screen.getByRole("button", { name: "حفظ" })).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<PrimaryBtn onClick={onClick}>حفظ</PrimaryBtn>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled and does not call onClick when disabled prop is set", () => {
    const onClick = vi.fn();
    render(<PrimaryBtn disabled onClick={onClick}>حفظ</PrimaryBtn>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("merges extra className", () => {
    render(<PrimaryBtn className="my-extra-class">حفظ</PrimaryBtn>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("my-extra-class");
  });

  it("applies amber gradient class", () => {
    render(<PrimaryBtn>حفظ</PrimaryBtn>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("amber");
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* DangerBtn                                                        */
/* ─────────────────────────────────────────────────────────────── */
describe("DangerBtn", () => {
  it("renders children text", () => {
    render(<DangerBtn>حذف</DangerBtn>);
    expect(screen.getByRole("button", { name: "حذف" })).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<DangerBtn onClick={onClick}>حذف</DangerBtn>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop is set", () => {
    render(<DangerBtn disabled>حذف</DangerBtn>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("has red styling", () => {
    render(<DangerBtn>حذف</DangerBtn>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("red");
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* GhostBtn                                                         */
/* ─────────────────────────────────────────────────────────────── */
describe("GhostBtn", () => {
  it("renders children text", () => {
    render(<GhostBtn>إلغاء</GhostBtn>);
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<GhostBtn onClick={onClick}>إلغاء</GhostBtn>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop is set", () => {
    render(<GhostBtn disabled>إلغاء</GhostBtn>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("has border styling (ghost style)", () => {
    render(<GhostBtn>إلغاء</GhostBtn>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border");
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* SInput                                                           */
/* ─────────────────────────────────────────────────────────────── */
describe("SInput", () => {
  it("renders as an input element", () => {
    render(<SInput placeholder="اكتب هنا" />);
    expect(screen.getByPlaceholderText("اكتب هنا")).toBeTruthy();
  });

  it("passes value and onChange correctly", () => {
    const onChange = vi.fn();
    render(<SInput value="مرحبا" onChange={onChange} readOnly />);
    const input = screen.getByDisplayValue("مرحبا");
    expect(input).toBeTruthy();
  });

  it("respects type attribute", () => {
    render(<SInput type="number" data-testid="num-input" />);
    const input = screen.getByTestId("num-input") as HTMLInputElement;
    expect(input.type).toBe("number");
  });

  it("is disabled when disabled prop is set", () => {
    render(<SInput disabled data-testid="dis-input" />);
    expect(screen.getByTestId("dis-input")).toBeDisabled();
  });

  it("merges extra className", () => {
    render(<SInput className="custom-class" data-testid="cls-input" />);
    const input = screen.getByTestId("cls-input");
    expect(input.className).toContain("custom-class");
  });

  it("fires onChange when user types", () => {
    const onChange = vi.fn();
    render(<SInput onChange={onChange} data-testid="type-input" />);
    fireEvent.change(screen.getByTestId("type-input"), { target: { value: "test" } });
    expect(onChange).toHaveBeenCalledOnce();
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* SSelect                                                          */
/* ─────────────────────────────────────────────────────────────── */
describe("SSelect", () => {
  it("renders a select element with children", () => {
    render(
      <SSelect data-testid="sel">
        <option value="a">خيار أ</option>
        <option value="b">خيار ب</option>
      </SSelect>,
    );
    const select = screen.getByTestId("sel") as HTMLSelectElement;
    expect(select.tagName.toLowerCase()).toBe("select");
    expect(select.options).toHaveLength(2);
  });

  it("reflects value prop", () => {
    const onChange = vi.fn();
    render(
      <SSelect value="b" onChange={onChange} data-testid="sel2">
        <option value="a">أ</option>
        <option value="b">ب</option>
      </SSelect>,
    );
    const select = screen.getByTestId("sel2") as HTMLSelectElement;
    expect(select.value).toBe("b");
  });

  it("calls onChange when selection changes", () => {
    const onChange = vi.fn();
    render(
      <SSelect onChange={onChange} data-testid="sel3">
        <option value="a">أ</option>
        <option value="b">ب</option>
      </SSelect>,
    );
    fireEvent.change(screen.getByTestId("sel3"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledOnce();
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* FieldLabel                                                       */
/* ─────────────────────────────────────────────────────────────── */
describe("FieldLabel", () => {
  it("renders children text", () => {
    render(<FieldLabel>اسم المستخدم</FieldLabel>);
    expect(screen.getByText("اسم المستخدم")).toBeTruthy();
  });

  it("renders as a label element", () => {
    render(<FieldLabel>البريد الإلكتروني</FieldLabel>);
    const el = screen.getByText("البريد الإلكتروني");
    expect(el.tagName.toLowerCase()).toBe("label");
  });
});
