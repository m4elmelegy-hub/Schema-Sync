import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth, type AuthUser } from "@/contexts/auth";

/* ─── helpers ──────────────────────────────────────────────────── */

const mockAdmin: AuthUser = {
  id: 1,
  name: "محمد الأمين",
  username: "admin",
  role: "admin",
  permissions: { can_view_sales: true },
};

const mockCashier: AuthUser = {
  id: 2,
  name: "أحمد الكاشير",
  username: "cashier1",
  role: "cashier",
  warehouse_id: 10,
  safe_id: 5,
};

function TestConsumer() {
  const { user, token, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="user-name">{user?.name ?? "no-user"}</span>
      <span data-testid="token">{token ?? "no-token"}</span>
      <button onClick={() => login(mockAdmin, "test-token-abc")}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* Initial state                                                    */
/* ─────────────────────────────────────────────────────────────── */
describe("AuthProvider — initial state", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it("starts with no user when localStorage is empty", () => {
    renderWithAuth();
    expect(screen.getByTestId("user-name").textContent).toBe("no-user");
  });

  it("starts with no token when localStorage is empty", () => {
    renderWithAuth();
    expect(screen.getByTestId("token").textContent).toBe("no-token");
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* Login                                                            */
/* ─────────────────────────────────────────────────────────────── */
describe("AuthProvider — login", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it("sets user after login", async () => {
    renderWithAuth();
    await act(async () => {
      screen.getByText("login").click();
    });
    expect(screen.getByTestId("user-name").textContent).toBe("محمد الأمين");
  });

  it("sets token after login", async () => {
    renderWithAuth();
    await act(async () => {
      screen.getByText("login").click();
    });
    expect(screen.getByTestId("token").textContent).toBe("test-token-abc");
  });

  it("persists user to localStorage on login", async () => {
    renderWithAuth();
    await act(async () => {
      screen.getByText("login").click();
    });
    expect(vi.mocked(localStorage.setItem)).toHaveBeenCalledWith(
      "erp_current_user",
      expect.stringContaining("محمد الأمين"),
    );
  });

  it("persists token to localStorage on login", async () => {
    renderWithAuth();
    await act(async () => {
      screen.getByText("login").click();
    });
    expect(vi.mocked(localStorage.setItem)).toHaveBeenCalledWith(
      "erp_auth_token",
      "test-token-abc",
    );
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* Logout                                                           */
/* ─────────────────────────────────────────────────────────────── */
describe("AuthProvider — logout", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it("clears user after logout", async () => {
    renderWithAuth();
    await act(async () => { screen.getByText("login").click(); });
    await act(async () => { screen.getByText("logout").click(); });
    expect(screen.getByTestId("user-name").textContent).toBe("no-user");
  });

  it("clears token after logout", async () => {
    renderWithAuth();
    await act(async () => { screen.getByText("login").click(); });
    await act(async () => { screen.getByText("logout").click(); });
    expect(screen.getByTestId("token").textContent).toBe("no-token");
  });

  it("removes user from localStorage on logout", async () => {
    renderWithAuth();
    await act(async () => { screen.getByText("login").click(); });
    await act(async () => { screen.getByText("logout").click(); });
    expect(vi.mocked(localStorage.removeItem)).toHaveBeenCalledWith("erp_current_user");
  });

  it("removes token from localStorage on logout", async () => {
    renderWithAuth();
    await act(async () => { screen.getByText("login").click(); });
    await act(async () => { screen.getByText("logout").click(); });
    expect(vi.mocked(localStorage.removeItem)).toHaveBeenCalledWith("erp_auth_token");
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* Restore from localStorage                                        */
/* ─────────────────────────────────────────────────────────────── */
describe("AuthProvider — restore from localStorage", () => {
  it("restores an admin user from localStorage on mount", () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === "erp_current_user") return JSON.stringify(mockAdmin);
      if (key === "erp_auth_token") return "restored-token";
      return null;
    });

    renderWithAuth();
    expect(screen.getByTestId("user-name").textContent).toBe("محمد الأمين");
    expect(screen.getByTestId("token").textContent).toBe("restored-token");
  });

  it("does NOT restore a cashier without warehouse_id/safe_id (invalid role)", () => {
    const invalidCashier: AuthUser = { ...mockCashier, warehouse_id: null, safe_id: null };
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === "erp_current_user") return JSON.stringify(invalidCashier);
      if (key === "erp_auth_token") return "token";
      return null;
    });

    renderWithAuth();
    expect(screen.getByTestId("user-name").textContent).toBe("no-user");
  });

  it("restores a valid cashier (has warehouse_id and safe_id)", () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === "erp_current_user") return JSON.stringify(mockCashier);
      if (key === "erp_auth_token") return "cashier-token";
      return null;
    });

    renderWithAuth();
    expect(screen.getByTestId("user-name").textContent).toBe("أحمد الكاشير");
  });

  it("handles corrupted localStorage JSON gracefully", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("INVALID_JSON{{{");
    renderWithAuth();
    expect(screen.getByTestId("user-name").textContent).toBe("no-user");
  });
});
