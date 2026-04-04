import { createContext, useContext, useState, ReactNode } from "react";

export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: string;
  permissions?: Record<string, boolean>;
  active?: boolean;
  warehouse_id?: number | null;
  safe_id?: number | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

const USER_KEY  = "erp_current_user";
const TOKEN_KEY = "erp_auth_token";

function isValidForRole(u: AuthUser): boolean {
  if (u.role === "cashier" || u.role === "salesperson") {
    return !!u.warehouse_id && !!u.safe_id;
  }
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const s = localStorage.getItem(USER_KEY);
      if (!s) return null;
      const parsed = JSON.parse(s) as AuthUser;
      if (!isValidForRole(parsed)) {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );

  const login = (u: AuthUser, t: string) => {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    localStorage.setItem(TOKEN_KEY, t);
    setUser(u);
    setToken(t);
  };

  const logout = () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
