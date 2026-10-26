import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "./api";
import type { SignupRequest, User } from "./types";

// undefined = still checking a saved session, null = signed out
type Me = User | null | undefined;

interface Ctx {
  user: Me;
  login: (email: string, password: string) => Promise<User>;
  signup: (req: SignupRequest) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** The account changed here (name or email edited): use the server's new copy. */
  setAccount: (user: User) => void;
}
const AuthCtx = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me>(api.hasToken() ? undefined : null);

  useEffect(() => {
    api.setSignedOutHandler(() => { api.setToken(null); setUser(null); });
    if (api.hasToken()) api.getMe().then(setUser).catch(() => { api.setToken(null); setUser(null); });
  }, []);

  const start = useCallback(async (session: Promise<api.SignedIn>) => {
    const { token, source, user } = await session;
    api.setToken(token, source);
    setUser(user);
    return user;
  }, []);
  /** Re-reads the account, after something about it changed (a guide saved their profile). */
  const refresh = useCallback(() => api.syncMe().then(setUser).catch(() => {}), []);

  const login = useCallback((email: string, password: string) => start(api.login(email, password)), [start]);
  const signup = useCallback((req: SignupRequest) => start(api.signup(req)), [start]);
  const logout = useCallback(() => {
    api.logout().catch(() => {}); // the local sign-out below happens either way
    api.setToken(null);
    setUser(null);
  }, []);

  return <AuthCtx.Provider value={{ user, login, signup, logout, refresh, setAccount: setUser }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
