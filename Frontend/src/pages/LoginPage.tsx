import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api";
import { useAuth } from "../AuthContext";

export default function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await login(email, password);
    } catch (e) {
      setErr(t(e instanceof ApiError && e.status === 401 ? "auth.badLogin" : "auth.failed"));
      setBusy(false);
    }
  };

  return (
    <div className="page authcard">
      <h1>{t("auth.signIn")}</h1>
      <form onSubmit={submit}>
        <label>{t("auth.email")}
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>{t("auth.password")}
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p role="alert" className="error">{err}</p>
        <p role="status" className="muted">{busy ? t("auth.waking") : ""}</p>
        <button type="submit" className="primary" disabled={busy}>{t("auth.signIn")}</button>
      </form>
      <p className="switch">{t("auth.noAccount")} <Link to="/signup" state={{ from }}>{t("auth.signUp")}</Link></p>
      <p className="muted">{t("auth.adminNote")}</p>
    </div>
  );
}
