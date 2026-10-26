import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api";
import { useAuth } from "../AuthContext";
import GuideFields from "../GuideFields";
import type { GuideProfileIn } from "../types";

const ROLES = ["tourist", "guide"] as const;
const emptyGuide: GuideProfileIn = {
  gender: "FEMALE", bio: "", regions: [], languages: ["ko"], daily_rate: 100000, interests: [], access_tags: [],
};

export default function SignupPage() {
  const { t } = useTranslation();
  const { user, signup } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [role, setRole] = useState<(typeof ROLES)[number]>("tourist");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [g, setG] = useState(emptyGuide);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (role === "guide" && (g.regions.length === 0 || g.languages.length === 0)) return setErr(t("auth.invalid"));
    setBusy(true);
    setErr("");
    try {
      await signup({ email, password, display_name: name, role, guide: role === "guide" ? g : undefined });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setErr(t(status === 409 || status === 400 ? "auth.emailTaken" : status === 422 ? "auth.invalid" : "auth.failed"));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>{t("auth.signUp")}</h1>
      <form onSubmit={submit}>
        <fieldset>
          <legend className="fieldlabel">{t("auth.iAm")}</legend>
          {ROLES.map((r) => {
            const [title, desc] = t(`auth.${r}`) as unknown as string[];
            return (
              <label key={r} className={"option" + (role === r ? " picked" : "")}>
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                <span><strong>{title}</strong><small>{desc}</small></span>
              </label>
            );
          })}
        </fieldset>

        <fieldset>
          <label>{t(role === "guide" ? "auth.nameGuide" : "auth.name")}
            <input type="text" required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>{t("auth.email")}
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>{t("auth.password")}
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" aria-describedby="pw-hint"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <small id="pw-hint" className="muted">{t("auth.passwordHint")}</small>
          </label>
        </fieldset>

        {role === "guide" && (
          <>
            <h2>{t("auth.guideProfile")}</h2>
            <GuideFields value={g} onChange={setG} />
          </>
        )}

        <p role="alert" className="error">{err}</p>
        <p role="status" className="muted">{busy ? t("auth.waking") : ""}</p>
        <button type="submit" className="primary" disabled={busy}>{t("auth.signUp")}</button>
      </form>
      <p className="switch">{t("auth.haveAccount")} <Link to="/login" state={{ from }}>{t("auth.signIn")}</Link></p>
    </div>
  );
}
