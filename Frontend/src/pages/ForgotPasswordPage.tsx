import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { requestPasswordReset } from "../api";

/**
 * "Forgot password?": asks the server to email a reset link. The reply never says whether the email
 * has an account, so the page can't be used to find out who is registered.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      await requestPasswordReset(email.trim());
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="page authcard">
      <h1>{t("reset.forgotTitle")}</h1>
      {state === "sent" ? (
        <p className="notice" role="status">{t("reset.sent", { email: email.trim() })}</p>
      ) : (
        <form onSubmit={submit}>
          <p className="muted">{t("reset.forgotIntro")}</p>
          <label>{t("auth.email")}
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {state === "failed" && <p role="alert" className="error">{t("reset.sendFailed")}</p>}
          <p role="status" className="muted">{state === "busy" ? t("auth.waking") : ""}</p>
          <button type="submit" className="primary" disabled={state === "busy"}>{t("reset.send")}</button>
        </form>
      )}
      <p className="muted small-note">{t("reset.idHint")}</p>
      <p className="switch"><Link to="/login">{t("reset.backToSignIn")}</Link></p>
    </div>
  );
}
