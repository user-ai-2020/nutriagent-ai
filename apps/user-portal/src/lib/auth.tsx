import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface User {
  userId: number;
  name: string;
  email: string;
  role: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading: loading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api<User>("/api/auth/me"),
    retry: false,
    staleTime: Infinity,
  });

  async function login(email: string, password: string) {
    const data = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.removeItem("selectedMealId");
    queryClient.setQueryData(["auth", "me"], data.user);
  }

  async function register(name: string, email: string, password: string) {
    const data = await api<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    localStorage.removeItem("selectedMealId");
    queryClient.setQueryData(["auth", "me"], data.user);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("selectedMealId");
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
