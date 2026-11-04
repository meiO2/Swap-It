"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiRequest } from "@/lib/api";

export type AuthUser = { id: string; name: string; email: string; role: "CUSTOMER" | "ADMIN" | "INSPECTOR" };
type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUser(await apiRequest<AuthUser>("/api/auth/me"));
      setError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      } else {
        setError(error instanceof Error ? error.message : "Could not load your account.");
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<AuthUser>("/api/auth/me")
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (active && requestError instanceof ApiError && requestError.status === 401) {
          setUser(null);
        } else if (active) {
          setError(requestError instanceof Error ? requestError.message : "Could not load your account.");
          console.error("Could not load the current user.", requestError);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const signOut = useCallback(async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, error, refresh, signOut }), [user, loading, error, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
