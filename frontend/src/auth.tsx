import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { BASE_URL, USER_ID_KEY, getOrCreateUserId } from "./api";

const TOKEN_KEY = "anglerj.access_token";
const REMEMBER_KEY = "anglerj.remember_me";
const GUEST_MODE_KEY = "anglerj.guest_mode"; // "1" when user explicitly chose to continue as guest

// Cross-platform secure storage abstraction
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* ignore */
    }
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};

export type AuthUser = {
  user_id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  auth_provider: "email" | "google" | "apple";
  is_premium?: boolean;
  is_admin?: boolean;
  created_at: string;
};

export type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isGuest: boolean;
  loading: boolean; // checking session on cold start
  signingIn: boolean; // an auth action in progress
  error: string | null;
};

export type MigrateInfo = { spots: number; catches: number };

export type AuthContextValue = AuthState & {
  registerEmail: (email: string, password: string, name?: string, rememberMe?: boolean) => Promise<MigrateInfo | null>;
  loginEmail: (email: string, password: string, rememberMe?: boolean) => Promise<MigrateInfo | null>;
  loginGoogle: (rememberMe?: boolean) => Promise<MigrateInfo | null>;
  loginApple: (rememberMe?: boolean) => Promise<MigrateInfo | null>;
  enableGuestMode: () => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function apiPost<T>(path: string, body: any, token?: string | null): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const msg = (parsed && (parsed.detail || parsed.message)) || text || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return parsed as T;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isGuest: false,
    loading: true,
    signingIn: false,
    error: null,
  });

  // Cold-start session restore (honors "remember me")
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [token, remember, guest] = await Promise.all([
        storage.getItem(TOKEN_KEY),
        storage.getItem(REMEMBER_KEY),
        AsyncStorage.getItem(GUEST_MODE_KEY),
      ]);
      const isGuest = guest === "1";
      // If user previously chose NOT to remember, drop any lingering token
      if (token && remember !== "1") {
        await storage.removeItem(TOKEN_KEY);
        if (!cancelled)
          setState({ user: null, token: null, isGuest, loading: false, signingIn: false, error: null });
        return;
      }
      if (!token) {
        if (!cancelled) setState((s) => ({ ...s, isGuest, loading: false }));
        return;
      }
      try {
        const user = await apiGet<AuthUser>("/auth/me", token);
        if (!cancelled) setState({ user, token, isGuest: false, loading: false, signingIn: false, error: null });
      } catch {
        await storage.removeItem(TOKEN_KEY);
        if (!cancelled)
          setState({ user: null, token: null, isGuest, loading: false, signingIn: false, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = useCallback(async (token: string, user: AuthUser, rememberMe: boolean) => {
    await storage.setItem(TOKEN_KEY, token);
    await storage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
    // Authenticated users are not guests
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
    // Replace guest user_id with authenticated user_id so legacy code that reads
    // USER_ID_KEY (spots / catches list etc.) keeps working seamlessly.
    await AsyncStorage.setItem(USER_ID_KEY, user.user_id);
  }, []);

  const handleAuthResponse = useCallback(
    async (
      resp: { access_token: string; user: AuthUser; migrated?: MigrateInfo },
      rememberMe: boolean,
    ) => {
      await persistSession(resp.access_token, resp.user, rememberMe);
      setState({
        user: resp.user,
        token: resp.access_token,
        isGuest: false,
        loading: false,
        signingIn: false,
        error: null,
      });
      return resp.migrated || { spots: 0, catches: 0 };
    },
    [persistSession],
  );

  const registerEmail = useCallback(
    async (email: string, password: string, name?: string, rememberMe: boolean = true) => {
      setState((s) => ({ ...s, signingIn: true, error: null }));
      try {
        const guest_user_id = await getOrCreateUserId();
        const resp = await apiPost<{ access_token: string; user: AuthUser; migrated: MigrateInfo }>(
          "/auth/register",
          { email: email.trim().toLowerCase(), password, name, guest_user_id },
        );
        return await handleAuthResponse(resp, rememberMe);
      } catch (e: any) {
        setState((s) => ({ ...s, signingIn: false, error: e?.message || "Sign up failed" }));
        throw e;
      }
    },
    [handleAuthResponse],
  );

  const loginEmail = useCallback(
    async (email: string, password: string, rememberMe: boolean = true) => {
      setState((s) => ({ ...s, signingIn: true, error: null }));
      try {
        const guest_user_id = await getOrCreateUserId();
        const resp = await apiPost<{ access_token: string; user: AuthUser; migrated: MigrateInfo }>(
          "/auth/login",
          { email: email.trim().toLowerCase(), password, guest_user_id },
        );
        return await handleAuthResponse(resp, rememberMe);
      } catch (e: any) {
        setState((s) => ({ ...s, signingIn: false, error: e?.message || "Sign in failed" }));
        throw e;
      }
    },
    [handleAuthResponse],
  );

  const loginGoogle = useCallback(async (rememberMe: boolean = true) => {
    setState((s) => ({ ...s, signingIn: true, error: null }));
    try {
      const guest_user_id = await getOrCreateUserId();
      let sessionId: string | null = null;

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          const hash = window.location.hash || "";
          const search = window.location.search || "";
          const matchHash = hash.match(/session_id=([^&]+)/);
          const matchSearch = search.match(/session_id=([^&]+)/);
          if (matchHash) sessionId = decodeURIComponent(matchHash[1]);
          else if (matchSearch) sessionId = decodeURIComponent(matchSearch[1]);
          if (!sessionId) {
            const redirectUrl = window.location.origin + "/login";
            window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
            return null;
          }
          window.history.replaceState(null, "", window.location.pathname);
        }
      } else {
        const redirectUrl = Linking.createURL("login");
        const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        if (result.type !== "success" || !result.url) {
          setState((s) => ({ ...s, signingIn: false }));
          return null;
        }
        const m = result.url.match(/session_id=([^&]+)/);
        if (!m) throw new Error("No session_id returned from Google");
        sessionId = decodeURIComponent(m[1]);
      }

      if (!sessionId) throw new Error("Google sign-in canceled");
      const resp = await apiPost<{ access_token: string; user: AuthUser; migrated: MigrateInfo }>(
        "/auth/google",
        { session_id: sessionId, guest_user_id },
      );
      return await handleAuthResponse(resp, rememberMe);
    } catch (e: any) {
      setState((s) => ({ ...s, signingIn: false, error: e?.message || "Google sign-in failed" }));
      throw e;
    }
  }, [handleAuthResponse]);

  const loginApple = useCallback(async (rememberMe: boolean = true) => {
    setState((s) => ({ ...s, signingIn: true, error: null }));
    try {
      if (Platform.OS !== "ios") {
        throw new Error("Apple Sign-In is only available on iOS");
      }
      const AppleAuth = await import("expo-apple-authentication");
      const available = await AppleAuth.isAvailableAsync();
      if (!available) throw new Error("Apple Sign-In not available on this device");
      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });
      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ")
        : undefined;
      const guest_user_id = await getOrCreateUserId();
      const resp = await apiPost<{ access_token: string; user: AuthUser; migrated: MigrateInfo }>(
        "/auth/apple",
        {
          identity_token: credential.identityToken,
          email: credential.email,
          full_name: fullName,
          apple_user_id: credential.user,
          guest_user_id,
        },
      );
      return await handleAuthResponse(resp, rememberMe);
    } catch (e: any) {
      const msg = e?.message || "Apple sign-in failed";
      if (/canceled|ERR_CANCEL/i.test(msg)) {
        setState((s) => ({ ...s, signingIn: false, error: null }));
        return null;
      }
      setState((s) => ({ ...s, signingIn: false, error: msg }));
      throw e;
    }
  }, [handleAuthResponse]);

  const enableGuestMode = useCallback(async () => {
    await AsyncStorage.setItem(GUEST_MODE_KEY, "1");
    setState((s) => ({ ...s, isGuest: true, error: null }));
  }, []);

  const refreshMe = useCallback(async () => {
    if (!state.token) return;
    try {
      const user = await apiGet<AuthUser>("/auth/me", state.token);
      setState((s) => ({ ...s, user }));
    } catch {
      /* ignore */
    }
  }, [state.token]);

  const logout = useCallback(async () => {
    try {
      if (state.token) {
        await fetch(`${BASE_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${state.token}` },
        });
      }
    } catch {
      /* ignore */
    }
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(REMEMBER_KEY);
    // Reset guest user id so the user starts fresh next time
    await AsyncStorage.removeItem(USER_ID_KEY);
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
    setState({ user: null, token: null, isGuest: false, loading: false, signingIn: false, error: null });
  }, [state.token]);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      registerEmail,
      loginEmail,
      loginGoogle,
      loginApple,
      enableGuestMode,
      logout,
      refreshMe,
      clearError,
    }),
    [state, registerEmail, loginEmail, loginGoogle, loginApple, enableGuestMode, logout, refreshMe, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export async function getAuthToken(): Promise<string | null> {
  return storage.getItem(TOKEN_KEY);
}
