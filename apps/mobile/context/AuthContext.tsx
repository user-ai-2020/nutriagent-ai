import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  applyMobileLayoutDirection,
  resolveInitialPreferredLanguage,
  setStoredPreferredLanguage,
  type ResponseLanguage,
} from "@/lib/languagePreference";
import * as storage from "@/lib/storage";

interface User {
  userId: number;
  name: string;
  email: string;
  role: string;
}

interface MeResponse extends User {
  profile?: { preferredLanguage?: string | null };
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  preferredLanguage: ResponseLanguage;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setPreferredLanguage: (lang: ResponseLanguage) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function bootstrapLanguage(profileValue?: string | null): Promise<ResponseLanguage> {
  const lang = await resolveInitialPreferredLanguage(profileValue);
  await applyMobileLayoutDirection(lang, { userInitiated: false });
  return lang;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [preferredLanguage, setPreferredLanguageState] = useState<ResponseLanguage>("en");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storage.getItem("token").then(async (stored) => {
      try {
        if (stored) {
          setToken(stored);
          const me = await api<MeResponse>("/api/auth/me", stored);
          setUser(me);
          const lang = await bootstrapLanguage(me.profile?.preferredLanguage);
          setPreferredLanguageState(lang);
        } else {
          const lang = await bootstrapLanguage(undefined);
          setPreferredLanguageState(lang);
        }
      } catch {
        await storage.deleteItem("token");
        setToken(null);
        setUser(null);
        const lang = await bootstrapLanguage(undefined);
        setPreferredLanguageState(lang);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{ token: string; user: User }>("/api/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await storage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    const me = await api<MeResponse>("/api/auth/me", data.token);
    const lang = await bootstrapLanguage(me.profile?.preferredLanguage);
    setPreferredLanguageState(lang);
  }

  async function register(name: string, email: string, password: string) {
    const data = await api<{ token: string; user: User }>("/api/auth/register", null, {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    await storage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    const lang = await bootstrapLanguage(undefined);
    setPreferredLanguageState(lang);
  }

  async function logout() {
    await storage.deleteItem("token");
    setToken(null);
    setUser(null);
  }

  async function setPreferredLanguage(lang: ResponseLanguage) {
    if (!token) throw new Error("Authentication required");
    await api<{ preferredLanguage: ResponseLanguage }>("/api/users/me/language", token, {
      method: "PATCH",
      body: JSON.stringify({ preferredLanguage: lang }),
    });
    await setStoredPreferredLanguage(lang);
    setPreferredLanguageState(lang);
    await applyMobileLayoutDirection(lang, { userInitiated: true });
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        preferredLanguage,
        loading,
        login,
        register,
        logout,
        setPreferredLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
