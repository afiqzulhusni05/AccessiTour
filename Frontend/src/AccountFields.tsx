import { useTranslation } from "react-i18next";
import { ApiError, updateAccount } from "./api";
import type { User } from "./types";

export interface AccountDraft { display_name: string; email: string; current_password: string }
export const accountDraft = (u: User): AccountDraft => ({ display_name: u.display_name, email: u.email, current_password: "" });

/** Saves the name and email if either changed. Resolves to the account as it now is. */
export async function saveAccount(user: User, d: AccountDraft): Promise<User> {
  const same = d.display_name.trim() === user.display_name && d.email.trim().toLowerCase() === user.email;
  return same ? user : updateAccount(d.display_name, d.email, d.current_password);
}

/** The message key for a failed save, or null when the failure wasn't about the account details. */
export const accountError = (e: unknown): string | null =>
  e instanceof ApiError ? { 403: "account.wrongPassword", 409: "account.taken", 422: "account.invalid" }[e.status] ?? null : null;

/** Name and email inputs for the "My profile" edit forms. The current password is asked for only when the email changes. */
export default function AccountFields({ user, value: d, onChange, nameLabel }: {
  user: User;
  value: AccountDraft;
  onChange: (d: AccountDraft) => void;
  nameLabel: string;
}) {
  const { t } = useTranslation();
  const emailChanged = d.email.trim().toLowerCase() !== user.email;
  return (
    <fieldset>
      <div className="row">
        <label>{nameLabel}
          <input type="text" required maxLength={60} autoComplete="name" value={d.display_name} onChange={(e) => onChange({ ...d, display_name: e.target.value })} />
        </label>
        <label>{t("auth.email")}
          <input type="email" required maxLength={254} autoComplete="email" value={d.email} onChange={(e) => onChange({ ...d, email: e.target.value })} />
        </label>
      </div>
      {emailChanged && (
        <label>{t("account.currentPassword")}
          <input type="password" required autoComplete="current-password" value={d.current_password} onChange={(e) => onChange({ ...d, current_password: e.target.value })} />
          <small className="muted">{t("account.passwordWhy")}</small>
        </label>
      )}
    </fieldset>
  );
}
