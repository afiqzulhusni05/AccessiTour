import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { MatchResult, TouristProfile } from "./types";

interface Ctx {
  profile: TouristProfile | null;
  setProfile: (p: TouristProfile) => void;
  // Kept here so the guide page can read a match without refetching. null = not loaded for this profile.
  results: MatchResult[] | null;
  setResults: (r: MatchResult[]) => void;
}
const ProfileCtx = createContext<Ctx>({ profile: null, setProfile: () => {}, results: null, setResults: () => {} });

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<TouristProfile | null>(null);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const setProfile = useCallback((p: TouristProfile) => {
    setProfileState(p);
    setResults(null);
  }, []);
  return <ProfileCtx.Provider value={{ profile, setProfile, results, setResults }}>{children}</ProfileCtx.Provider>;
}
export const useProfile = () => useContext(ProfileCtx);
