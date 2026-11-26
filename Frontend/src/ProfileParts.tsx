import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, removeMyPhoto, setMyPhoto } from "./api";
import { useAuth } from "./AuthContext";
import Avatar from "./Avatar";
import type { User } from "./types";

// Simple line icons for the profile rows (24×24, drawn with the text colour)
const ICONS = {
  mobility: "M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 22l2-7 3 3v4M7 12l2-4h5l2 4M10 8l-1 7",
  language: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  food: "M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11M17 2c-2 1-3 4-3 7h3v13",
  person: "M20 20v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  pin: "M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  money: "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  access: "M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 8h14M12 8v6M9 22l3-8 3 8",
  note: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
  key: "M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "M9 6l6 6-6 6",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Top of the profile: the photo (or initial) with add/change/remove, the name, email and account type. */
export function ProfileHeader({ user, badge }: { user: User; badge?: ReactNode }) {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"up" | "remove" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const has = Boolean(user.photo_url);

  const act = async (kind: "up" | "remove", op: () => Promise<void>, done: string) => {
    setBusy(kind);
    setMsg(null);
    try {
      await op();
      await refresh();
      setMsg({ ok: true, text: t(done) });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setMsg({
        ok: false,
        text: status === 404 || status === 405 ? t("pcard.photoUnavailable")
          : e instanceof ApiError && e.detail ? e.detail : t("pcard.photoFailed"),
      });
    } finally {
      setBusy(null);
    }
  };
  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (input.current) input.current.value = ""; // picking the same file again still counts
    if (file) act("up", () => setMyPhoto(file), "pcard.photoSaved");
  };

  return (
    <section className="phead">
      <div className="phead-photo">
        <Avatar name={user.display_name} photo={user.photo_url} size="xl" tone="crimson" />
        <button
          type="button" className="phead-cam" disabled={busy !== null} onClick={() => input.current?.click()}
          aria-label={t(has ? "pcard.photoChange" : "pcard.photoAdd")} title={t(has ? "pcard.photoChange" : "pcard.photoAdd")}
        ><Icon name="camera" /></button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files)} />
      </div>
      <div>
        <h2>{user.display_name}</h2>
        <p>{user.email}</p>
        <p className="phead-tags"><span className="pill">{t(`role.${user.role}`)}</span>{badge}</p>
        <p className="phead-photoacts">
          <button type="button" className="textlink" disabled={busy !== null} onClick={() => input.current?.click()}>
            {busy === "up" ? t("pcard.photoUploading") : t(has ? "pcard.photoChange" : "pcard.photoAdd")}
          </button>
          {has && (
            <button type="button" className="textlink" disabled={busy !== null} onClick={() => act("remove", removeMyPhoto, "pcard.photoRemoved")}>
              {busy === "remove" ? t("pcard.photoRemoving") : t("pcard.photoRemove")}
            </button>
          )}
        </p>
        {!has && !msg && <p className="muted phead-hint">{t(user.role === "guide" ? "pcard.photoHintGuide" : "pcard.photoHintTourist")}</p>}
        {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "muted phead-hint" : "error phead-hint"}>{msg.text}</p>}
      </div>
    </section>
  );
}

/** A white card with a title and an optional "Edit" link on the right. */
export function ProfileCard({ title, onEdit, editLabel, tone, children }: {
  title: string; onEdit?: () => void; editLabel?: string; tone?: "sos-tone"; children: ReactNode;
}) {
  const { t } = useTranslation();
  const id = "pcard-" + title.replace(/\W+/g, "-").toLowerCase();
  return (
    <section className={"pcard" + (tone ? ` ${tone}` : "")} aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        {onEdit && <button type="button" className="pcard-edit" onClick={onEdit}>{editLabel ?? t("pcard.edit")}</button>}
      </header>
      {children}
    </section>
  );
}

/** One row: icon, small label, and the value as text or as tags. Empty values show "Not set". */
export function InfoRow({ icon, label, value, tags }: { icon: IconName; label: string; value?: ReactNode; tags?: string[] }) {
  const { t } = useTranslation();
  const empty = tags ? tags.length === 0 : value === undefined || value === null || value === "";
  return (
    <li>
      <span className="ico"><Icon name={icon} /></span>
      <div>
        <small>{label}</small>
        {empty ? <span className="muted">{t("pcard.notSet")}</span>
          : tags ? <ul className="ptags">{tags.map((x) => <li key={x}>{x}</li>)}</ul>
          : <span className="val">{value}</span>}
      </div>
    </li>
  );
}

/** Change password and sign out, like the account section at the bottom of most apps. */
export function AccountCard() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <ProfileCard title={t("pcard.account")}>
      <ul className="plinks">
        <li>
          <Link to="/forgot-password"><Icon name="key" /><span>{t("pcard.changePassword")}<small>{t("pcard.changePasswordHint")}</small></span><Icon name="chevron" /></Link>
        </li>
        <li>
          <button type="button" className="danger-link" onClick={() => { navigate("/login", { replace: true }); logout(); }}>
            <Icon name="logout" /><span>{t("auth.signOut")}</span>
          </button>
        </li>
      </ul>
    </ProfileCard>
  );
}
