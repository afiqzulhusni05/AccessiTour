import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PasswordInput from "../PasswordInput";
import { ApiError, resetPassword } from "../api";

/** Opened from the emailed link (?token=…): choose a new password. Each link works once, for 30 minutes. */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const token = useSearchParams()[0].get("token") ?? "";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setErr(t("auth.passwordHint"));
    if (password !== again) return setErr(t("reset.mismatch"));
    setState("busy");
    setErr("");
    try {
      await resetPassword(token, password);
      setState("done");
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 && e.detail ? e.detail : t("reset.failed"));
      setState("idle");
    }
  };

  if (!token) {
    return (
      <div className="page authcard">
        <h1>{t("reset.title")}</h1>
        <p role="alert" className="error">{t("reset.noToken")}</p>
        <p className="switch"><Link to="/forgot-password">{t("reset.askAgain")}</Link></p>
      </div>
    );
  }
  return (
    <div className="page authcard">
      <h1>{t("reset.title")}</h1>
      {state === "done" ? (
        <>
          <p className="notice" role="status">{t("reset.done")}</p>
          <p className="switch"><Link to="/login" className="primary btn">{t("auth.signIn")}</Link></p>
        </>
      ) : (
        <form onSubmit={submit}>
          <label>{t("reset.newPassword")}
            <PasswordInput required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <small className="muted">{t("auth.passwordHint")}</small>
          </label>
          <label>{t("reset.again")}
            <PasswordInput required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </label>
          <p role="alert" className="error">{err}</p>
          {err && <p className="small-note"><Link to="/forgot-password">{t("reset.askAgain")}</Link></p>}
          <button type="submit" className="primary" disabled={state === "busy"}>{t("reset.save")}</button>
        </form>
      )}
    </div>
  );
}
